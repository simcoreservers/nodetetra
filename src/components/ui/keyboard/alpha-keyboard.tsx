"use client"

import React, { useState } from 'react';
import { X, ArrowUp, ChevronUp } from 'lucide-react';

interface AlphaKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const AlphaKeyboard: React.FC<AlphaKeyboardProps> = ({ value, onChange, onClose }) => {
  const [isShifted, setIsShifted] = useState(false);
  const [isSymbols, setIsSymbols] = useState(false);
  
  const handleKeyPress = (key: string) => {
    console.log('Alpha keyboard press:', key);
    let newValue = value;
    
    switch (key) {
      case 'backspace':
        newValue = value.slice(0, -1);
        break;
      case 'clear':
        newValue = '';
        break;
      case 'shift':
        setIsShifted(!isShifted);
        return; // Return early without triggering onChange
      case 'symbols':
        setIsSymbols(!isSymbols);
        setIsShifted(false);
        return; // Return early without triggering onChange
      case 'space':
        newValue = value + ' ';
        break;
      default:
        newValue = value + key;
        // Auto-unshift after a key press
        if (isShifted) {
          setIsShifted(false);
        }
        break;
    }
    
    console.log('New alpha value:', newValue);
    onChange(newValue);
  };

  // Define keyboard layouts
  const alphabetLower = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];
  
  const alphabetUpper = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];
  
  const symbolsPage1 = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '#', '$', '%', '&', '*', '-', '+', '(', ')'],
    ['!', '"', '\'', ':', ';', ',', '.', '?', '/']
  ];
  
  const symbolsPage2 = [
    ['~', '`', '|', '•', '√', 'π', '÷', '×', '¶', '∆'],
    ['£', '¢', '€', '¥', '^', '°', '=', '{', '}', '\\'],
    ['©', '®', '™', '℅', '[', ']', '<', '>']
  ];
  
  // Determine which layout to use
  let currentLayout;
  if (isSymbols) {
    currentLayout = isShifted ? symbolsPage2 : symbolsPage1;
  } else {
    currentLayout = isShifted ? alphabetUpper : alphabetLower;
  }

  return (
    <div className="w-full" style={{ minWidth: '300px', maxWidth: '100%' }}>
      <div className="flex justify-between items-center mb-2 p-2">
        <div className="text-base font-medium">Keyboard</div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-[#333333] rounded-full"
          aria-label="Close keyboard"
        >
          <X size={20} />
        </button>
      </div>
      
      <div className="flex bg-[#121212] border border-[#333333] rounded-md mb-3 p-3">
        <div className="flex-1 overflow-x-auto whitespace-nowrap text-lg">{value}</div>
      </div>
      
      <div className="keyboard-rows space-y-2">
        {currentLayout.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center space-x-2">
            {row.map((key) => (
              <button
                key={key}
                onClick={() => handleKeyPress(key)}
                className="bg-[#252525] hover:bg-[#333333] active:bg-[#444444] text-white py-3 px-2 min-w-[40px] rounded-md text-xl font-medium text-center transition-colors touch-manipulation"
              >
                {key}
              </button>
            ))}
          </div>
        ))}
        
        {/* Bottom row with special keys */}
        <div className="flex justify-between space-x-2 mt-2">
          <button
            onClick={() => handleKeyPress('shift')}
            className={`${
              isShifted ? 'bg-[#333333]' : 'bg-[#252525]'
            } hover:bg-[#444444] active:bg-[#555555] text-white py-3 px-3 rounded-md flex items-center justify-center transition-colors touch-manipulation`}
            style={{ minWidth: '60px' }}
          >
            <ArrowUp size={20} />
          </button>
          
          <button
            onClick={() => handleKeyPress('symbols')}
            className={`${
              isSymbols ? 'bg-[#333333]' : 'bg-[#252525]'
            } hover:bg-[#444444] active:bg-[#555555] text-white py-3 px-3 rounded-md transition-colors text-lg touch-manipulation`}
            style={{ minWidth: '70px' }}
          >
            {isSymbols ? 'ABC' : '?123'}
          </button>
          
          <button
            onClick={() => handleKeyPress('space')}
            className="bg-[#252525] hover:bg-[#333333] active:bg-[#444444] text-white py-3 px-3 rounded-md flex-1 transition-colors text-lg touch-manipulation"
          >
            Space
          </button>
          
          <button
            onClick={() => handleKeyPress('backspace')}
            className="bg-[#252525] hover:bg-[#333333] active:bg-[#444444] text-white py-3 px-3 rounded-md transition-colors text-lg touch-manipulation"
            style={{ minWidth: '80px' }}
          >
            ← Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlphaKeyboard;