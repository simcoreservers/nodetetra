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
    setCurrentValue(value);
    if (targetRef.current) {
      // Update the input value
      targetRef.current.value = value;
      
      // Dispatch an input event to trigger any form validation or listeners
      const event = new Event('input', { bubbles: true });
      targetRef.current.dispatchEvent(event);
      
      // Also dispatch a change event for React form handling
      const changeEvent = new Event('change', { bubbles: true });
      targetRef.current.dispatchEvent(changeEvent);
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