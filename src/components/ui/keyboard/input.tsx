"use client"

import React, { useRef, InputHTMLAttributes } from 'react';
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
  
  const handleInputFocus = () => {
    if (inputRef.current) {
      // Prevent the mobile keyboard from showing up
      inputRef.current.blur();
      
      // Open our custom keyboard
      openKeyboard(
        inputRef,
        inputRef.current.value,
        inputType
      );
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };
  
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      defaultValue={defaultValue}
      className={`bg-[#1e1e1e] border border-[#333333] rounded p-2 ${className || ''}`}
      onFocus={handleInputFocus}
      onChange={handleChange}
      {...props}
    />
  );
};

export default Input;