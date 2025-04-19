"use client"

import React, { createContext, useState, useRef, useCallback } from 'react';

type InputType = 'numeric' | 'text';

interface KeyboardContextType {
  isOpen: boolean;
  inputType: InputType;
  targetRef: React.RefObject<HTMLInputElement> | null;
  currentValue: string;
  openKeyboard: (ref: React.RefObject<HTMLInputElement>, initialValue: string, type: InputType) => void;
  onValueChange: (value: string) => void;
  onClose: () => void;
}

export const KeyboardContext = createContext<KeyboardContextType>({
  isOpen: false,
  inputType: 'text',
  targetRef: null,
  currentValue: '',
  openKeyboard: () => {},
  onValueChange: () => {},
  onClose: () => {}
});

export const KeyboardProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputType, setInputType] = useState<InputType>('text');
  const [currentValue, setCurrentValue] = useState('');
  const targetRef = useRef<HTMLInputElement | null>(null);
  
  const openKeyboard = useCallback((
    ref: React.RefObject<HTMLInputElement>,
    initialValue: string,
    type: InputType
  ) => {
    targetRef.current = ref.current;
    setCurrentValue(initialValue);
    setInputType(type);
    setIsOpen(true);
  }, []);
  
  const onValueChange = useCallback((value: string) => {
    console.log('Context value change:', value);
    setCurrentValue(value);
    
    if (targetRef.current) {
      console.log('Updating target input:', targetRef.current);
      
      // Update the input value
      targetRef.current.value = value;
      
      // Create and dispatch events using a more compatible approach
      try {
        // For React controlled inputs
        if (targetRef.current.dispatchEvent) {
          // Input event
          const inputEvent = new Event('input', { bubbles: true });
          targetRef.current.dispatchEvent(inputEvent);
          
          // Change event
          const changeEvent = new Event('change', { bubbles: true });
          targetRef.current.dispatchEvent(changeEvent);
          
          console.log('Events dispatched successfully');
        }
      } catch (error) {
        console.error('Error dispatching events:', error);
      }
    } else {
      console.warn('No target ref for value change');
    }
  }, []);
  
  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);
  
  const value = {
    isOpen,
    inputType,
    targetRef,
    currentValue,
    openKeyboard,
    onValueChange,
    onClose
  };
  
  return (
    <KeyboardContext.Provider value={value}>
      {children}
    </KeyboardContext.Provider>
  );
};

// Custom hook to use the keyboard context
export const useKeyboard = () => {
  const context = React.useContext(KeyboardContext);
  if (context === undefined) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
};