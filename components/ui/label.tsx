import React from "react";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ children, className = "", ...props }, ref) => {
    return (
      <label ref={ref} className={`text-sm font-medium ${className}`} {...props}>
        {children}
      </label>
    );
  }
);

Label.displayName = "Label";
