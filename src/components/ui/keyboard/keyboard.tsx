"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { KeyboardContext, KeyboardProvider } from './keyboard-context';
import NumericKeypad from './numeric-keypad';
import AlphaKeyboard from './alpha-keyboard';

interface KeyboardProps {
  children: React.ReactNode;
}

// The main component that wraps the application to provide keyboard functionality
export const Keyboard: React.FC<KeyboardProps> = ({ children }) => {
  return (
    <KeyboardProvider>
      <KeyboardContainer />
      {children}
    </KeyboardProvider>
  );
};

// The keyboard container that renders the actual keyboard
const KeyboardContainer: React.FC = () => {
  const { 
    isOpen, 
    inputType, 
    targetRef, 
    currentValue, 
    onValueChange, 
    onClose 
  } = React.useContext(KeyboardContext);
  
  const keyboardRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  // Handle clicking outside the keyboard
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        keyboardRef.current && 
        !keyboardRef.current.contains(event.target as Node) && 
        targetRef?.current && 
        !targetRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, targetRef]);
  
  // Handle keyboard visibility when user taps in a different area
  useEffect(() => {
    setMounted(true);
    
    // Set up debugging
    console.log('Keyboard container mounted');
    
    // Log keyboard state changes
    console.log('Keyboard state:', {
      isOpen,
      inputType,
      currentValue,
      targetRefExists: !!targetRef?.current
    });
  }, [isOpen, inputType, currentValue, targetRef]);
  
  const handleKeyboardInput = useCallback((value: string) => {
    onValueChange(value);
  }, [onValueChange]);
  
  // Position the keyboard near the input field
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  useEffect(() => {
    if (isOpen && targetRef?.current) {
      const rect = targetRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Position keyboard below the input field, but ensure it doesn't go off screen
      const keyboardHeight = inputType === 'numeric' ? 220 : 300; // Approximate heights
      
      // If there's not enough space below, position above
      if (rect.bottom + keyboardHeight > windowHeight) {
        setPosition({
          top: Math.max(rect.top - keyboardHeight, 0),
          left: rect.left
        });
      } else {
        setPosition({
          top: rect.bottom,
          left: rect.left
        });
      }
    }
  }, [isOpen, targetRef, inputType]);
  
  if (!mounted) return null;
  
  if (!isOpen) {
    console.log('Keyboard not open');
    return null;
  }
  
  // Make sure we have access to the document body before rendering
  if (typeof document === 'undefined') {
    console.log('Document not available yet');
    return null;
  }
  
  return createPortal(
    <div 
      ref={keyboardRef}
      className="fixed z-50 bg-[#1e1e1e] border border-[#333333] rounded-md shadow-lg p-2 w-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxWidth: '100vw',
        maxHeight: '50vh',
        transition: 'transform 0.3s ease',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)'
      }}
    >
      {inputType === 'numeric' ? (
        <NumericKeypad 
          value={currentValue} 
          onChange={handleKeyboardInput} 
          onClose={onClose} 
        />
      ) : (
        <AlphaKeyboard 
          value={currentValue} 
          onChange={handleKeyboardInput} 
          onClose={onClose} 
        />
      )}
    </div>,
    document.body
  );
};

export default Keyboard;