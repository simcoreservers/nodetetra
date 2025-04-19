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
  
  // Position the keyboard for optimal touch experience
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  
  useEffect(() => {
    if (isOpen && targetRef?.current) {
      const rect = targetRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      
      // For smaller screens (mobile), use full width keyboard at bottom
      if (windowWidth <= 768) { // mobile breakpoint
        const keyboardHeight = inputType === 'numeric' ? 300 : 400; // Approximate heights
        
        setPosition({
          top: windowHeight - keyboardHeight,
          left: 0,
          width: windowWidth
        });
      } else {
        // For larger screens, position near the input field
        const keyboardHeight = inputType === 'numeric' ? 280 : 360;
        // Limit keyboard width to prevent overflow
        const keyboardWidth = Math.min(windowWidth * 0.8, inputType === 'numeric' ? 350 : 600);
        
        // Center the keyboard horizontally relative to the input
        let left = rect.left + (rect.width / 2) - (keyboardWidth / 2);
        
        // Ensure keyboard stays within horizontal screen bounds
        left = Math.max(10, Math.min(left, windowWidth - keyboardWidth - 10));
        
        // Position keyboard below or above the input depending on available space
        let top;
        if (rect.bottom + keyboardHeight + 10 > windowHeight) {
          // Position above input if not enough space below
          top = Math.max(10, rect.top - keyboardHeight - 10);
          // If there's not enough space above either, position at top of screen with padding
          if (top < 10) {
            top = 10;
          }
        } else {
          // Position below input
          top = rect.bottom + 10;
        }
        
        setPosition({
          top,
          left,
          width: keyboardWidth
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
  
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  
  return createPortal(
    <div 
      ref={keyboardRef}
      className={`fixed z-50 ${isMobile ? 'bottom-0 left-0 right-0' : ''} bg-[#1e1e1e] border border-[#333333] rounded-t-lg shadow-lg`}
      style={{
        top: isMobile ? 'auto' : `${position.top}px`,
        left: isMobile ? 0 : `${position.left}px`,
        width: isMobile ? '100%' : `${position.width}px`,
        maxWidth: '100vw', // Ensure it never extends beyond viewport width
        overflow: 'hidden',
        transition: 'transform 0.3s ease',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        padding: isMobile ? '12px 8px 16px 8px' : '8px',
        boxShadow: '0 -4px 10px rgba(0, 0, 0, 0.3)'
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