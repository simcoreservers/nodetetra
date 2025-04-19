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
  console.log('Rendering KeyboardContainer');
  
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
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  
  // Set up client-side portal
  useEffect(() => {
    setMounted(true);
    console.log('Keyboard mounted, setting portal element');
    setPortalElement(document.body);
    
    // Log whenever keyboard state changes
    console.log('Keyboard state updated:', { isOpen, inputType, currentValue });
  }, [isOpen, inputType, currentValue]); 
  
  // Handle clicking outside the keyboard
  useEffect(() => {
    if (!mounted) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (
        keyboardRef.current && 
        !keyboardRef.current.contains(event.target as Node) && 
        targetRef?.current && 
        !targetRef.current.contains(event.target as Node)
      ) {
        console.log('Clicked outside keyboard - closing');
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, targetRef, mounted]);
  
  const handleKeyboardInput = useCallback((value: string) => {
    console.log('Keyboard input:', value);
    
    // First, try the direct handler if available
    if (targetRef?.current && (targetRef.current as any)._keyboardChangeHandler) {
      console.log('Using direct change handler');
      (targetRef.current as any)._keyboardChangeHandler(value);
    }
    
    // Also update through context for the normal event flow
    onValueChange(value);
  }, [onValueChange, targetRef]);
  
  // Position the keyboard near the input field
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  useEffect(() => {
    if (isOpen && targetRef?.current) {
      const rect = targetRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      
      // Position keyboard below the input field, but ensure it doesn't go off screen
      const keyboardHeight = inputType === 'numeric' ? 250 : 350; // Approximate heights
      // Calculate appropriate width based on input type
      const keyboardWidth = inputType === 'numeric' ? 
        Math.min(350, windowWidth - 20) : // Numeric needs less width
        Math.min(600, windowWidth - 20);  // Text needs more width
      
      console.log('Positioning keyboard for input at:', {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        windowHeight,
        windowWidth,
        keyboardHeight,
        keyboardWidth
      });
      
      // Calculate horizontal position - center relative to input but ensure it stays on screen
      let left = Math.max(10, Math.min(
        rect.left + (rect.width / 2) - (keyboardWidth / 2), // Center align
        windowWidth - keyboardWidth - 10 // Don't go off right edge
      ));
      
      // If there's not enough space below, position above
      let top;
      if (rect.bottom + keyboardHeight > windowHeight) {
        top = Math.max(10, rect.top - keyboardHeight - 10);
        // If there's not enough space above either, position at top with padding
        if (top < 10) {
          top = 10;
        }
      } else {
        top = rect.bottom + 10; // Add a small gap
      }
      
      setPosition({
        top,
        left
      });
    }
  }, [isOpen, targetRef, inputType]);
  
  if (!mounted || !portalElement) {
    console.log('Not mounted or no portal element yet');
    return null;
  }
  
  if (!isOpen) {
    console.log('Keyboard is not open');
    return null;
  }
  
  console.log('Rendering keyboard portal with position:', position);
  
  return createPortal(
    <div 
      ref={keyboardRef}
      className="fixed z-50 bg-[#1e1e1e] border border-[#333333] rounded-md shadow-lg p-3"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxWidth: '95vw',
        width: inputType === 'numeric' ? '350px' : '600px',
        maxHeight: '60vh',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      <div className="kb-debug" style={{fontSize: '10px', color: '#666', marginBottom: '4px'}}>
        Type: {inputType} | Value: {currentValue}
      </div>
      
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
    portalElement
  );
};

export default Keyboard;