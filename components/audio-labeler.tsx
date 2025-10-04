"use client";

import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import { v4 as uuidv4 } from "uuid";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Types
type Party = {
  id: string;
  role: "agent" | "customer" | "unknown";
  name?: string;
  uri?: string;
};

type Ann = {
  id: string;
  type: string;
  start: number;
  end: number;
  value: string;
  target?: string;
  channel?: number;
};

export default function AudioLabeler() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [rate, setRate] = useState<number>(1);
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(100);
  const [playing, setPlaying] = useState<boolean>(false);

  const [partyL, setPartyL] = useState<Party>({
    id: "party-1",
    role: "agent",
    name: "Agent",
  });
  const [partyR, setPartyR] = useState<Party>({
    id: "party-2",
    role: "customer",
    name: "Customer",
  });

  const [anns, setAnns] = useState<Ann[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    type: string;
    value: string;
    target: "left" | "right" | "both";
  }>({ type: "topic", value: "", target: "left" });

  // Init WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !timelineRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#e5e7eb",
      progressColor: "#3b82f6",
      cursorColor: "#1f2937",
      height: 180,
      minPxPerSec: zoomPxPerSec,
      splitChannels: true,
      barGap: 2,
      barWidth: 3,
      barRadius: 2,
      plugins: [
        RegionsPlugin.create({
          dragSelection: true,
        }),
        TimelinePlugin.create({
          container: timelineRef.current,
          height: 20,
        }),
      ],
    });

    ws.on("ready", () => {
      setDuration(ws.getDuration());
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));

    const regions = ws.registerPlugin(RegionsPlugin.create());

    regions.on("region-created", (region: any) => {
      setActiveRegionId(region.id);
    });

    regions.on("region-updated", (region: any) => {
      setActiveRegionId(region.id);
    });

    regions.on("region-clicked", (region: any, e: MouseEvent) => {
      e.stopPropagation();
      setActiveRegionId(region.id);
      region.play();
    });

    wsRef.current = ws;
    regionsRef.current = regions;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [zoomPxPerSec]);

  // Reload audio when file chosen
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !audioFile) return;

    const url = URL.createObjectURL(audioFile);
    ws.load(url);

    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  const togglePlay = () => {
    wsRef.current?.playPause();
  };

  const zoom = (px: number) => {
    setZoomPxPerSec(px);
  };

  const addRegionFromSelection = () => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions) return;

    const start = ws.getCurrentTime();
    const end = Math.min(start + 2.0, ws.getDuration());
    const region = regions.addRegion({
      start,
      end,
      drag: true,
      resize: true,
      color: "rgba(59,130,246,0.2)",
    });
    setActiveRegionId(region.id);
  };

  const deleteActiveRegion = () => {
    if (!regionsRef.current || !activeRegionId) return;
    const region = regionsRef.current
      .getRegions()
      .find((r: any) => r.id === activeRegionId);
    if (region) region.remove();
    setActiveRegionId(null);
  };

  const commitLabelToActiveRegion = () => {
    if (!regionsRef.current || !activeRegionId) return;
    const region = regionsRef.current
      .getRegions()
      .find((r: any) => r.id === activeRegionId);
    if (!region) return;

    const start = Number(region.start.toFixed(3));
    const end = Number(region.end.toFixed(3));

    const push = (channel: number | undefined) => {
      const targetParty =
        channel === 0 ? partyL.id : channel === 1 ? partyR.id : undefined;
      setAnns((prev) => [
        ...prev,
        {
          id: uuidv4(),
          type: draft.type || "label",
          start,
          end,
          value: draft.value || "label",
          target: targetParty,
          channel,
        },
      ]);
    };

    if (draft.target === "both") {
      push(0);
      push(1);
    } else if (draft.target === "left") {
      push(0);
    } else {
      push(1);
    }
  };

  const deleteAnnotation = (id: string) => {
    setAnns((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAll = () => {
    regionsRef.current?.getRegions().forEach((r: any) => r.remove());
    setAnns([]);
    setActiveRegionId(null);
  };

  const downloadVCon = () => {
    const nowIso = new Date().toISOString();
    const vcon = {
      vcon: "0.9.0",
      uuid: uuidv4(),
      parties: [partyL, partyR],
      media: [
        {
          type: audioFile ? audioFile.type || "audio/wav" : "audio",
          uri: audioFile ? `file:${audioFile.name}` : undefined,
          channels: 2,
          duration,
        },
      ],
      analysis: anns.map((a) => ({
        id: a.id,
        type: a.type,
        start: a.start,
        end: a.end,
        value: a.value,
        target: a.target,
        channel: a.channel,
      })),
      metadata: {
        created_at: nowIso,
        generator: "VConAudioLabeler",
      },
    };

    const blob = new Blob([JSON.stringify(vcon, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(audioFile?.name || "session").replace(/\.[^.]+$/, "")}-vcon.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto p-6 md:p-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            VCon Audio Labeler
          </h1>
          <p className="text-slate-600 text-lg">
            Professional stereo audio annotation with vCon export
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* File Upload & Party Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Setup
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <Label className="text-slate-700 mb-2 block">
                  Audio File (Stereo)
                </Label>
                <Input
                  type="file"
                  accept="audio/*"
                  onChange={(e: any) => setAudioFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                {audioFile && (
                  <p className="text-sm text-slate-500 mt-2">
                    {audioFile.name}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-slate-700 mb-2 block">
                  Left Channel (0)
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name"
                    value={partyL.name || ""}
                    onChange={(e) =>
                      setPartyL({ ...partyL, name: e.target.value })
                    }
                  />
                  <select
                    value={partyL.role}
                    onChange={(e) =>
                      setPartyL({
                        ...partyL,
                        role: e.target.value as any,
                      })
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="customer">Customer</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-slate-700 mb-2 block">
                  Right Channel (1)
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name"
                    value={partyR.name || ""}
                    onChange={(e) =>
                      setPartyR({ ...partyR, name: e.target.value })
                    }
                  />
                  <select
                    value={partyR.role}
                    onChange={(e) =>
                      setPartyR({
                        ...partyR,
                        role: e.target.value as any,
                      })
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="customer">Customer</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Waveform Player */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Audio Waveform
            </h2>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div ref={timelineRef} className="mb-3" />
              <div ref={containerRef} className="w-full" />
            </div>

            {/* Player Controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                <Button
                  onClick={togglePlay}
                  className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                >
                  {playing ? (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      Play
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => wsRef.current?.stop()}
                  className="hover:bg-slate-100"
                >
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 4h10v12H5V4z" />
                  </svg>
                  Stop
                </Button>
                <Button
                  onClick={addRegionFromSelection}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Region
                </Button>
                {activeRegionId && (
                  <Button
                    onClick={deleteActiveRegion}
                    variant="destructive"
                    className="hover:bg-red-50"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Region
                  </Button>
                )}
              </div>

              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-slate-600 text-xs">Zoom</Label>
                  <Input
                    type="range"
                    min={50}
                    max={400}
                    step={10}
                    value={zoomPxPerSec}
                    onChange={(e) => zoom(Number(e.target.value))}
                    className="w-32"
                  />
                  <span className="text-xs text-slate-500 w-8">{zoomPxPerSec}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-slate-600 text-xs">Speed</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={rate}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRate(v);
                      wsRef.current?.setPlaybackRate(v);
                    }}
                    className="w-16"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Annotation Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Annotation
            </h2>
            <div className="grid md:grid-cols-5 gap-4 mb-6">
              <div className="md:col-span-2">
                <Label className="text-slate-700 mb-2 block">Type</Label>
                <Input
                  placeholder="e.g., sentiment, intent, topic"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-slate-700 mb-2 block">Value</Label>
                <Input
                  placeholder="e.g., positive, cancel_account"
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-slate-700 mb-2 block">Channel</Label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      draft.target === "left"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setDraft({ ...draft, target: "left" })}
                  >
                    L
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      draft.target === "right"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setDraft({ ...draft, target: "right" })}
                  >
                    R
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      draft.target === "both"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setDraft({ ...draft, target: "both" })}
                  >
                    Both
                  </button>
                </div>
              </div>
            </div>
            <Button
              onClick={commitLabelToActiveRegion}
              disabled={!activeRegionId || !draft.value}
              className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Add Label to Region
            </Button>

            {/* Annotations List */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">
                  Labels ({anns.length})
                </h3>
                {anns.length > 0 && (
                  <Button
                    onClick={clearAll}
                    variant="destructive"
                    className="text-xs"
                  >
                    Clear All
                  </Button>
                )}
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {anns.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <p>No labels yet</p>
                    <p className="text-sm mt-1">Create a region and add your first label</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Start
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            End
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Value
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Channel
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Party
                          </th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {anns.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-sm text-slate-900">
                              {a.start.toFixed(3)}s
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-900">
                              {a.end.toFixed(3)}s
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {a.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-900 font-medium">
                              {a.value}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                a.channel === 0
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {a.channel === 0 ? "Left" : "Right"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {a.target === partyL.id ? partyL.name : partyR.name}
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => deleteAnnotation(a.id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                title="Delete label"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <Button
              onClick={downloadVCon}
              className="bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 text-base px-6 py-3"
              disabled={anns.length === 0}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export VCon JSON
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
