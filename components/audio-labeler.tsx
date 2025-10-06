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
  regionId?: string;
};

export default function AudioLabeler() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const minimapTimelineRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const minimapWsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const timelinePluginRef = useRef<any>(null);
  const loopRegionRef = useRef<boolean>(false);
  const playingRef = useRef<boolean>(false);

  // Generate timeline markers based on visible range
  const generateTimelineMarkers = () => {
    const { start, end } = visibleTimeRange;
    const duration = end - start;

    if (duration <= 0) return [];

    // Calculate appropriate interval based on zoom
    let interval = 1; // seconds
    if (duration > 60) interval = 10;
    else if (duration > 30) interval = 5;
    else if (duration > 10) interval = 2;
    else interval = 1;

    const markers: { time: number; position: number; label: string }[] = [];

    // Start from the first interval mark after the start time
    const firstMark = Math.ceil(start / interval) * interval;

    for (let time = firstMark; time <= end; time += interval) {
      const position = ((time - start) / duration) * 100;
      const label = formatTime(time);
      markers.push({ time, position, label });
    }

    return markers;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    return `${secs}.${ms}s`;
  };

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [rate, setRate] = useState<number>(1);
  const [zoomPxPerSec, setZoomPxPerSec] = useState<number>(100);
  const [playing, setPlaying] = useState<boolean>(false);
  const [viewportProgress, setViewportProgress] = useState<number>(0);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [loopRegion, setLoopRegion] = useState<boolean>(false);

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

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Label modal state
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelModalRegionId, setLabelModalRegionId] = useState<string | null>(null);
  const [labelModalData, setLabelModalData] = useState<{
    type: string;
    value: string;
    target: "left" | "right" | "both";
  }>({ type: "sentiment", value: "", target: "left" });

  // Helper function to update viewport indicator position
  const updateViewportIndicator = (ws: WaveSurfer, minimapWs: WaveSurfer) => {
    if (!ws || !minimapWs) return;

    const duration = ws.getDuration();
    if (!duration) return;

    // Get the scroll position - this represents the left edge of the viewport
    const wrapper = ws.getWrapper();
    const scrollContainer = wrapper.querySelector('.scroll') as HTMLElement;
    if (!scrollContainer) {
      // Fallback to current time if scroll container not found
      const currentTime = ws.getCurrentTime();
      const progress = currentTime / duration;
      setViewportProgress(progress);
      return;
    }

    const scrollLeft = scrollContainer.scrollLeft;
    const scrollWidth = scrollContainer.scrollWidth;
    const clientWidth = scrollContainer.clientWidth;

    // Calculate what portion of the audio is at the left edge of the viewport
    // Need to account for the fact that scrollWidth = contentWidth, but max scroll = scrollWidth - clientWidth
    const maxScroll = scrollWidth - clientWidth;
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    setViewportProgress(progress);
  };

  // Init WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !minimapRef.current || !minimapTimelineRef.current) return;

    const regions = RegionsPlugin.create();

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#e5e7eb",
      progressColor: "#3b82f6",
      cursorColor: "#1f2937",
      height: 180,
      minPxPerSec: 100, // Initial zoom level
      splitChannels: [
        { overlay: false },
        { overlay: false }
      ],
      barGap: 2,
      barWidth: 3,
      barRadius: 2,
      plugins: [
        regions,
      ],
    });

    // Create minimap waveform
    const minimapWs = WaveSurfer.create({
      container: minimapRef.current,
      waveColor: "#cbd5e1",
      progressColor: "#94a3b8",
      cursorColor: "transparent",
      height: 60,
      minPxPerSec: 10, // Much lower zoom for overview
      splitChannels: [
        { overlay: false },
        { overlay: false }
      ],
      barGap: 1,
      barWidth: 2,
      barRadius: 1,
      interact: false, // Disable normal interactions
      plugins: [
        TimelinePlugin.create({
          container: minimapTimelineRef.current,
          height: 15,
          timeInterval: 60, // Show markers every 1 minute
          primaryLabelInterval: 60, // Larger labels every 1 minute
        }),
      ],
    });

    ws.on("ready", () => {
      const duration = ws.getDuration();
      setDuration(duration);
      // Initialize visible time range
      setVisibleTimeRange({ start: 0, end: Math.min(duration, 10) });
    });

    // Adjust minimap zoom to fit entire waveform when minimap is ready
    minimapWs.on("ready", () => {
      const duration = minimapWs.getDuration();
      if (minimapRef.current && duration > 0) {
        const containerWidth = minimapRef.current.clientWidth;
        // Calculate pixels per second to fit entire audio in container width
        const pixelsPerSec = Math.max(1, containerWidth / duration);
        minimapWs.zoom(pixelsPerSec);
      }
    });

    // Track which region we're looping (determined when play starts)
    let loopingRegion: any = null;

    ws.on("play", () => {
      setPlaying(true);
      playingRef.current = true;

      // Determine which region to loop based on playhead position when play starts
      if (loopRegionRef.current && regions) {
        const currentTime = ws.getCurrentTime();
        const allRegions = regions.getRegions();

        // Find all regions that contain current playhead position
        const containingRegions = allRegions.filter((r: any) =>
          currentTime >= r.start && currentTime <= r.end
        );

        if (containingRegions.length > 0) {
          // Determine which region to loop based on nesting/overlap
          loopingRegion = containingRegions.reduce((selected: any, current: any) => {
            // Check if current is fully nested inside selected
            const currentFullyInSelected = current.start >= selected.start && current.end <= selected.end;
            // Check if selected is fully nested inside current
            const selectedFullyInCurrent = selected.start >= current.start && selected.end <= current.end;

            if (currentFullyInSelected && !selectedFullyInCurrent) {
              // Current is nested inside selected, pick the smaller (current)
              return current;
            } else if (selectedFullyInCurrent && !currentFullyInSelected) {
              // Selected is nested inside current, keep the smaller (selected)
              return selected;
            } else if (!currentFullyInSelected && !selectedFullyInCurrent) {
              // Overlapping (not nested), pick the one that starts later
              return current.start > selected.start ? current : selected;
            } else {
              // Both fully nested in each other (same region), pick smaller
              const selectedDuration = selected.end - selected.start;
              const currentDuration = current.end - current.start;
              return currentDuration < selectedDuration ? current : selected;
            }
          });
        }
      }
    });

    ws.on("pause", () => {
      setPlaying(false);
      playingRef.current = false;
      loopingRegion = null; // Reset looping region when paused
    });

    // Update viewport indicator when scrolling/seeking in main view
    ws.on("scroll", (visibleStartTime: number, visibleEndTime: number) => {
      updateViewportIndicator(ws, minimapWs);
      setVisibleTimeRange({ start: visibleStartTime, end: visibleEndTime });
    });

    ws.on("timeupdate", () => {
      updateViewportIndicator(ws, minimapWs);

      // Handle region looping
      if (loopRegionRef.current && playingRef.current && loopingRegion) {
        const currentTime = ws.getCurrentTime();

        // If we've reached or passed the end of the looping region, loop back
        if (currentTime >= loopingRegion.end - 0.1) {
          ws.setTime(loopingRegion.start);
        }
      }
    });

    ws.on("zoom", (minPxPerSec: number) => {
      updateViewportIndicator(ws, minimapWs);
      // Zoom doesn't provide visible times, so we need to calculate or trigger a scroll event
      // The scroll event will be fired after zoom, so timeline will update then
    });

    regions.on("region-created", (region: any) => {
      setActiveRegionId(region.id);
    });

    regions.on("region-updated", (region: any) => {
      setActiveRegionId(region.id);

      // Update annotation times when region is moved/resized
      setAnns(currentAnns => {
        return currentAnns.map(ann => {
          if (ann.regionId === region.id) {
            return {
              ...ann,
              start: Number(region.start.toFixed(3)),
              end: Number(region.end.toFixed(3)),
            };
          }
          return ann;
        });
      });
    });

    regions.on("region-clicked", (region: any, e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      setActiveRegionId(region.id);
      setLabelModalRegionId(region.id);

      // Check if there are existing annotations for this region
      setAnns(currentAnns => {
        const existingAnns = currentAnns.filter(a => a.regionId === region.id);

        if (existingAnns.length > 0) {
          // Check if we have annotations for both channels
          const hasLeft = existingAnns.some(a => a.channel === 0);
          const hasRight = existingAnns.some(a => a.channel === 1);

          // Load first annotation into modal
          const ann = existingAnns[0];

          let target: "left" | "right" | "both";
          if (hasLeft && hasRight) {
            target = "both";
          } else if (ann.channel === 0) {
            target = "left";
          } else {
            target = "right";
          }

          setLabelModalData({
            type: ann.type,
            value: ann.value,
            target: target,
          });
        } else {
          // Reset to defaults for new annotation
          setLabelModalData({
            type: "sentiment",
            value: "",
            target: "left",
          });
        }

        return currentAnns;
      });

      setShowLabelModal(true);
    });

    wsRef.current = ws;
    minimapWsRef.current = minimapWs;
    regionsRef.current = regions;

    return () => {
      ws.destroy();
      minimapWs.destroy();
      wsRef.current = null;
      minimapWsRef.current = null;
      regionsRef.current = null;
    };
  }, []); // Remove zoomPxPerSec from dependencies

  // Handle zoom changes without recreating WaveSurfer
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && audioFile && duration > 0) {
      ws.zoom(zoomPxPerSec);
    }
  }, [zoomPxPerSec, audioFile, duration]);

  // Reload audio when file chosen
  useEffect(() => {
    const ws = wsRef.current;
    const minimapWs = minimapWsRef.current;
    if (!ws || !audioFile) return;

    const url = URL.createObjectURL(audioFile);
    ws.load(url);

    // Load same audio into minimap
    if (minimapWs) {
      minimapWs.load(url);
    }

    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // Handle minimap clicks to jump to position
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const minimapWs = minimapWsRef.current;
    const ws = wsRef.current;
    if (!minimapWs || !ws || !minimapRef.current) return;

    // Get bounds of the actual minimap waveform container
    const bounds = minimapRef.current.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const width = bounds.width;
    const progress = Math.max(0, Math.min(1, x / width));
    // Scroll the viewport to this position
    const wrapper = ws.getWrapper();
    const scrollContainer = wrapper?.querySelector('.scroll') as HTMLElement; 
    if (scrollContainer) {
      const scrollWidth = scrollContainer.scrollWidth;
      const clientWidth = scrollContainer.clientWidth;
      const maxScroll = scrollWidth - clientWidth;
      const targetScrollLeft = progress * maxScroll;
      scrollContainer.scrollLeft = targetScrollLeft;
    }

    // Also seek to this position in the audio
    ws.seekTo(progress);
    setViewportProgress(progress);
  };

  // Handle timeline clicks to seek to position
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const ws = wsRef.current;
    if (!ws) return;

    const { start, end } = visibleTimeRange;
    const duration = end - start;

    if (duration <= 0) return;

    // Get bounds of the clicked timeline element
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const width = bounds.width;

    // Calculate click position as ratio (0 to 1) within the visible timeline
    const clickRatio = Math.max(0, Math.min(1, x / width));

    // Calculate the time within the visible range
    const targetTime = start + (clickRatio * duration);

    // Seek to that time
    ws.setTime(targetTime);
  };

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
    if (region) {
      region.remove();
      // Also remove all annotations for this region
      setAnns(prev => prev.filter(a => a.regionId !== activeRegionId));
    }
    setActiveRegionId(null);
  };

  const deleteRegion = (regionId: string) => {
    if (!regionsRef.current) return;
    const region = regionsRef.current.getRegions().find((r: any) => r.id === regionId);
    if (region) {
      region.remove();
      // Also remove all annotations for this region
      setAnns(prev => prev.filter(a => a.regionId !== regionId));
    }
  };

  const saveLabelModal = () => {
    if (!labelModalRegionId || !regionsRef.current) return;

    const region = regionsRef.current.getRegions().find((r: any) => r.id === labelModalRegionId);
    if (!region) return;

    const start = Number(region.start.toFixed(3));
    const end = Number(region.end.toFixed(3));

    // Remove existing annotations for this region
    setAnns(prev => prev.filter(a => a.regionId !== labelModalRegionId));

    // Add new annotation(s)
    const push = (channel: number | undefined) => {
      const targetParty =
        channel === 0 ? partyL.id : channel === 1 ? partyR.id : undefined;
      setAnns((prev) => [
        ...prev,
        {
          id: uuidv4(),
          type: labelModalData.type || "label",
          start,
          end,
          value: labelModalData.value || "",
          target: targetParty,
          channel,
          regionId: labelModalRegionId,
        },
      ]);
    };

    if (labelModalData.target === "both") {
      push(0);
      push(1);
    } else if (labelModalData.target === "left") {
      push(0);
    } else {
      push(1);
    }

    setShowLabelModal(false);
    setLabelModalRegionId(null);
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
          {/* Waveform Player */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Audio Waveform
            </h2>

            {/* Minimap Overview */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mb-4 relative">
              <div className="text-xs text-slate-500 mb-2 font-medium">Overview</div>
              <div
                className="relative cursor-pointer"
                onClick={handleMinimapClick}
              >
                <div className="pl-24">
                  <div ref={minimapTimelineRef} className="w-full mb-1" />
                  <div ref={minimapRef} className="w-full relative">
                    {/* Viewport indicator line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-600 pointer-events-none z-10"
                      style={{ left: `${viewportProgress * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 relative">
              {/* Custom Timeline */}
              <div
                className="mb-3 ml-24 cursor-pointer relative h-5"
                onClick={handleTimelineClick}
              >
                {generateTimelineMarkers().map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute"
                    style={{ left: `${marker.position}%` }}
                  >
                    <div className="w-px h-2 bg-slate-400" />
                    <div className="text-[10px] text-slate-600 absolute top-2 -translate-x-1/2 whitespace-nowrap">
                      {marker.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-20 flex flex-col justify-around py-2">
                  <div className="text-xs text-right pr-3">
                    <div className="font-medium text-slate-700">{partyL.name || "Left"}</div>
                    <div className="text-[10px] text-slate-400">{partyL.role}</div>
                  </div>
                  <div className="text-xs text-right pr-3">
                    <div className="font-medium text-slate-700">{partyR.name || "Right"}</div>
                    <div className="text-[10px] text-slate-400">{partyR.role}</div>
                  </div>
                </div>
                <div ref={containerRef} className="w-full pl-24" />
              </div>
            </div>

            {/* Player Controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-2 items-center">
                <Button
                  onClick={togglePlay}
                  disabled={!audioFile}
                  className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600 disabled:opacity-50 disabled:cursor-not-allowed p-3"
                  title={playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </Button>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loopRegion}
                    onChange={(e) => {
                      setLoopRegion(e.target.checked);
                      loopRegionRef.current = e.target.checked;
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span>Loop Region</span>
                </label>
                <Button
                  onClick={addRegionFromSelection}
                  disabled={!audioFile}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed p-3"
                  title="Add Region"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Button>
              </div>

              <div className="ml-auto flex items-center gap-3">
                {/* Zoom Control */}
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                  </svg>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="10"
                    value={zoomPxPerSec}
                    onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
                    disabled={!audioFile}
                    className="w-32 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Zoom"
                  />
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                  </svg>
                </div>

                <Button
                  onClick={() => setShowSettings(true)}
                  className="hover:bg-slate-100"
                  title="Settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 text-white hover:bg-slate-800 border-slate-700 p-3"
                  title="Open Audio"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e: any) => setAudioFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Labels List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Labels ({anns.length})
              </h2>
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
                        {[...anns].sort((a, b) => {
                          // Sort by start time first, then by end time
                          if (a.start !== b.start) return a.start - b.start;
                          return a.end - b.end;
                        }).map((a) => (
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
                              {a.value || "-"}
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Channel Settings
            </h3>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-700 mb-2 block">Left Channel (0)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name"
                    value={partyL.name || ""}
                    onChange={(e) => setPartyL({ ...partyL, name: e.target.value })}
                  />
                  <select
                    value={partyL.role}
                    onChange={(e) => setPartyL({ ...partyL, role: e.target.value as any })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="customer">Customer</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Right Channel (1)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name"
                    value={partyR.name || ""}
                    onChange={(e) => setPartyR({ ...partyR, name: e.target.value })}
                  />
                  <select
                    value={partyR.role}
                    onChange={(e) => setPartyR({ ...partyR, role: e.target.value as any })}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="agent">Agent</option>
                    <option value="customer">Customer</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => setShowSettings(false)}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Label Modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Label Region
            </h3>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-700 mb-2 block">Type</Label>
                <Input
                  placeholder="e.g., sentiment, intent, topic, emotion"
                  value={labelModalData.type}
                  onChange={(e) => setLabelModalData({ ...labelModalData, type: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Value</Label>
                <Input
                  placeholder="e.g., positive, cancel_account, pricing"
                  value={labelModalData.value}
                  onChange={(e) => setLabelModalData({ ...labelModalData, value: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Channel</Label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      labelModalData.target === "left"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setLabelModalData({ ...labelModalData, target: "left" })}
                  >
                    Left ({partyL.name})
                  </button>
                  <button
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      labelModalData.target === "right"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setLabelModalData({ ...labelModalData, target: "right" })}
                  >
                    Right ({partyR.name})
                  </button>
                  <button
                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      labelModalData.target === "both"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                    onClick={() => setLabelModalData({ ...labelModalData, target: "both" })}
                  >
                    Both
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowLabelModal(false);
                  setLabelModalRegionId(null);
                }}
                className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
              >
                Cancel
              </Button>
              {labelModalRegionId && (
                <Button
                  onClick={() => {
                    deleteRegion(labelModalRegionId);
                    setShowLabelModal(false);
                    setLabelModalRegionId(null);
                  }}
                  variant="destructive"
                  className="flex-1"
                >
                  Delete Region
                </Button>
              )}
              <Button
                onClick={saveLabelModal}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
              >
                Save Label
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
