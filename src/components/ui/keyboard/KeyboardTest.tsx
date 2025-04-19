"use client"

import React, { useState } from 'react';
import { Input } from './index';

export const KeyboardTest: React.FC = () => {
  const [textValue, setTextValue] = useState('');
  const [numberValue, setNumberValue] = useState('0');
  
  console.log('Keyboard test component render, values:', { textValue, numberValue });
  
  return (
    <div className="bg-[#252525] p-4 rounded-lg mb-6">
      <h3 className="text-xl font-bold mb-4">Keyboard Test Component</h3>
      <p className="text-sm text-yellow-400 mb-4">
        This is a test component to verify the custom keyboard is working properly.
        Click on the input fields below to try it out.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-2">Text Input Test</label>
          <Input 
            type="text"
            className="w-full mb-1"
            placeholder="Click to open keyboard"
            value={textValue}
            onChange={(value) => {
              console.log('Text input changed to:', value);
              setTextValue(value);
            }}
          />
          <p className="text-xs text-gray-400">Current value: "{textValue}"</p>
        </div>
        
        <div>
          <label className="block text-sm mb-2">Number Input Test</label>
          <Input 
            type="number"
            className="w-full mb-1"
            placeholder="0"
            value={numberValue}
            onChange={(value) => {
              console.log('Number input changed to:', value);
              setNumberValue(value);
            }}
          />
          <p className="text-xs text-gray-400">Current value: {numberValue}</p>
        </div>
      </div>
      
      <div className="mt-4 text-xs text-gray-400">
        <p>Check the browser console for debugging information.</p>
      </div>
    </div>
  );
};

export default KeyboardTest;