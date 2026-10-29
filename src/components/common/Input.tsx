import React, { useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: string;
  showPasswordToggle?: boolean;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      type = 'text',
      showPasswordToggle = false,
      rightElement,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const isPasswordType = type === 'password';
    const effectiveType = isPasswordType && showPasswordToggle
      ? (isPasswordVisible ? 'text' : 'password')
      : type;

    const hasRightContent = (showPasswordToggle && isPasswordType) || rightElement;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none select-none">
              {icon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            type={effectiveType}
            className={`w-full h-10 px-3 ${
              icon ? 'pl-9' : ''
            } ${
              hasRightContent ? 'pr-10' : ''
            } rounded-lg bg-surface-container-lowest border ${
              error ? 'border-error focus:ring-error/20' : 'border-outline-variant focus:border-primary focus:ring-primary/20'
            } text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:bg-surface-container-low ${className}`}
            {...props}
          />
          {showPasswordToggle && isPasswordType && (
            <button
              type="button"
              onClick={() => setIsPasswordVisible((prev) => !prev)}
              aria-label={isPasswordVisible ? 'Ocultar senha' : 'Visualizar senha'}
              title={isPasswordVisible ? 'Ocultar senha' : 'Visualizar senha'}
              className="absolute right-2.5 p-1 text-outline hover:text-on-surface focus:text-primary focus:outline-none transition-colors rounded-md flex items-center justify-center hover:bg-surface-container-high/60 active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px] select-none">
                {isPasswordVisible ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          )}
          {!showPasswordToggle && rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error && <span className="text-xs font-medium text-error flex items-center gap-1">{error}</span>}
        {helperText && !error && <span className="text-xs text-on-surface-variant">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

