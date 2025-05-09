"use client"

import React from 'react';
import { X } from 'lucide-react';

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const NumericKeypad: React.FC<NumericKeypadProps> = ({ value, onChange, onClose }) => {
  const handleKeyPress = (key: string) => {
    console.log('Numeric keypad press:', key);
    let newValue = value;
    
    switch (key) {
      case 'backspace':
        newValue = value.slice(0, -1);
        break;
      case 'clear':
        newValue = '';
        break;
      case '.':
        // Only add decimal point if not already present
        if (!value.includes('.')) {
          newValue = value + key;
        }
        break;
      case '-':
        // Only add minus sign if not already present and at beginning
        if (!value.includes('-')) {
          newValue = '-' + value;
        } else {
          newValue = value.replace('-', '');
        }
        break;
      default:
        newValue = value + key;
        break;
    }
    
    console.log('New numeric value:', newValue);
    onChange(newValue);
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-between items-center mb-2 p-2">
        <div className="text-base font-medium">Numeric Keypad</div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-[#333333] rounded-full"
          aria-label="Close keyboard"
        >
          <X size={20} />
        </button>
      </div>
      
      <div className="flex bg-[#121212] border border-[#333333] rounded-md mb-3 p-3">
        <div className="flex-1 text-right overflow-x-auto whitespace-nowrap text-lg">{value}</div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '-'].map((key) => (
          <button
            key={key}
            onClick={() => handleKeyPress(key)}
            className="bg-[#252525] hover:bg-[#333333] active:bg-[#444444] text-white font-medium py-4 rounded-md text-xl transition-colors touch-manipulation"
          >
            {key}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => handleKeyPress('clear')}
          className="bg-[#400000] hover:bg-[#600000] active:bg-[#800000] text-white py-4 rounded-md text-lg transition-colors touch-manipulation"
        >
          Clear
        </button>
        <button
          onClick={() => handleKeyPress('backspace')}
          className="bg-[#252525] hover:bg-[#333333] active:bg-[#444444] text-white py-4 rounded-md text-lg transition-colors touch-manipulation"
        >
          ← Delete
        </button>
      </div>
    </div>
  );
};

export default NumericKeypad;