"use client"

import React, { useRef, useEffect, useCallback, InputHTMLAttributes } from 'react';
import { useKeyboard } from './keyboard-context';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (value: string) => void;
}

const Input: React.FC<InputProps> = ({ 
  type = 'text',
  value,
  defaultValue,
  onChange,
  className,
  ...props 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { openKeyboard } = useKeyboard();
  
  const inputType = type === 'number' ? 'numeric' : 'text';
  
  // When the input is mounted, set up debugging
  useEffect(() => {
    if (inputRef.current) {
      console.log('Input mounted:', inputRef.current);
    }
  }, []);
  
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    console.log('Input focused!', e.target);
    
    // Small delay to ensure refs are properly set up
    setTimeout(() => {
      if (inputRef.current) {
        console.log('Opening keyboard for:', {
          type: inputType,
          value: inputRef.current.value,
          element: inputRef.current
        });
        
        // Prevent the mobile keyboard from showing up
        // Use setTimeout to ensure the blur happens after the focus event is processed
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.blur();
          }
        }, 10);
        
        // Open our custom keyboard
        openKeyboard(
          inputRef,
          inputRef.current.value,
          inputType
        );
      } else {
        console.error('Input ref not available');
      }
    }, 50);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('Native input change:', e.target.value);
    if (onChange) {
      onChange(e.target.value);
    }
  };
  
  // Create an event handler for the keyboard to directly update React state
  const handleKeyboardChange = useCallback((newValue: string) => {
    console.log('Keyboard value change handler:', newValue);
    if (onChange) {
      onChange(newValue);
    }
  }, [onChange]);
  
  // Register the callback with the keyboard context
  useEffect(() => {
    if (inputRef.current) {
      // Add a data attribute to store the callback
      const element = inputRef.current;
      (element as any)._keyboardChangeHandler = handleKeyboardChange;
      return () => {
        (element as any)._keyboardChangeHandler = null;
      };
    }
  }, [handleKeyboardChange]);
  
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      defaultValue={defaultValue}
      className={`bg-[#1e1e1e] border border-[#333333] rounded p-2 ${className || ''}`}
      onFocus={handleInputFocus} 
      onChange={handleChange}
      onClick={(e) => {
        console.log('Input clicked');
        // Ensure focus happens on click
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }}
      {...props}
    />
  );
};

export default Input;