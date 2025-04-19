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
      
      // Position keyboard below the input field, but ensure it doesn't go off screen
      const keyboardHeight = inputType === 'numeric' ? 250 : 350; // Increased heights to be safe
      
      console.log('Positioning keyboard for input at:', {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        windowHeight,
        keyboardHeight
      });
      
      // If there's not enough space below, position above
      if (rect.bottom + keyboardHeight > windowHeight) {
        setPosition({
          top: Math.max(rect.top - keyboardHeight, 0),
          left: rect.left
        });
      } else {
        setPosition({
          top: rect.bottom + 10, // Add a small gap
          left: rect.left
        });
      }
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