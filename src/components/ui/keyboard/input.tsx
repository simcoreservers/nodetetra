"use client"

import React, { useRef, InputHTMLAttributes } from 'react';
import { useKeyboard } from './keyboard-context';

// Create a custom size type to avoid conflict with HTML input's size attribute
type InputSize = 'default' | 'large' | 'small';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  onChange?: (value: string) => void;
  size?: InputSize;
}

const Input: React.FC<InputProps> = ({ 
  type = 'text',
  value,
  defaultValue,
  onChange,
  className,
  size = 'default',
  ...props 
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { openKeyboard } = useKeyboard();
  
  const inputType = type === 'number' ? 'numeric' : 'text';
  
  const handleInputFocus = () => {
    console.log('Input focused!');
    if (inputRef.current) {
      console.log('Input ref exists, opening keyboard...');
      // Prevent the mobile keyboard from showing up
      inputRef.current.blur();
      
      // Open our custom keyboard with the correctly typed ref
      openKeyboard(
        { current: inputRef.current }, // Create a new ref object with the current value
        inputRef.current.value,
        inputType
      );
    } else {
      console.log('Input ref does not exist');
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };
  
  // Determine size classes
  const sizeClasses: Record<InputSize, string> = {
    small: 'py-1 px-2 text-sm',
    default: 'py-3 px-3 text-base',
    large: 'py-4 px-4 text-lg'
  };
  
  const selectedSize = sizeClasses[size];
  
  return (
    <div className="relative touch-manipulation">
      <input
        ref={inputRef}
        type={type}
        value={value}
        defaultValue={defaultValue}
        className={`w-full bg-[#1e1e1e] border border-[#333333] rounded-md ${selectedSize} focus:outline-none focus:ring-2 focus:ring-blue-500 ${className || ''}`}
        onFocus={handleInputFocus}
        onChange={handleChange}
        readOnly={true} // Prevent native keyboard
        {...props}
      />
      {/* Visual tap indicator */}
      <div 
        className="absolute inset-0 cursor-pointer" 
        onClick={handleInputFocus}
        aria-hidden="true"
      />
    </div>
  );
};

export default Input;