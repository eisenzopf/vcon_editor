import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const baseStyles = "rounded-2xl px-4 py-2 shadow-sm hover:shadow md:text-sm text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    const variantStyles = variant === "destructive"
      ? "text-red-600 border-red-200 hover:bg-red-50"
      : "border-gray-200 hover:bg-gray-50";

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
