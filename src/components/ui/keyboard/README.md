# Custom Keyboard Component for NuTetra

This folder contains a custom keyboard implementation for the NuTetra application that displays a custom keyboard popup when text input fields are focused. This is especially useful for touchscreen interfaces where you might want to provide a consistent, customized keyboard experience.

## Features

- Full alphanumeric keyboard with symbols
- Numeric-only keypad for number inputs
- Automatic selection of keyboard type based on input type
- Proper positioning near the focused input field
- Touch-friendly design with proper sizing for buttons
- Support for special characters and keyboard layouts

## Usage

### Basic Usage

The simplest way to use the custom keyboard is to import and use the `Input` component:

```jsx
import { Input } from "@/components/ui/keyboard";

// Replace regular inputs with the custom Input component
<Input 
  type="text" 
  className="your-classes-here" 
  value={value}
  onChange={(newValue) => setValue(newValue)} 
/>
```

### Number Inputs

For numeric input fields, simply set the type to "number":

```jsx
<Input 
  type="number" 
  className="your-classes-here" 
  value={numericValue}
  onChange={(newValue) => handleChange(newValue)} 
  min="0"
  max="100"
  step="0.1"
/>
```

### Password Fields

Password fields work the same way:

```jsx
<Input 
  type="password" 
  className="your-classes-here" 
  value={password}
  onChange={(newValue) => setPassword(newValue)} 
/>
```

## Implementation Details

The keyboard system consists of several components:

1. `KeyboardProvider` - Context provider that manages keyboard state
2. `Input` - Custom input component that triggers the keyboard
3. `Keyboard` - The main keyboard container component
4. `AlphaKeyboard` - Full keyboard for text input
5. `NumericKeypad` - Simplified keypad for number input

The system automatically:

- Shows/hides the keyboard when inputs are focused
- Positions the keyboard near the input
- Selects the appropriate keyboard type based on input type
- Updates input values as users type
- Closes the keyboard when clicking outside

## Customization

You can customize the keyboard appearance by modifying the respective components:

- `keyboard.tsx` - Main container and positioning logic
- `alpha-keyboard.tsx` - Full keyboard layout and styling
- `numeric-keypad.tsx` - Numeric keypad layout and styling

## Requirements

- The `KeyboardProvider` must be present in your application tree (it's included in the layout.tsx file)
- Use the `Input` component instead of the native HTML input element

## Notes

- The keyboard automatically detects the input type and shows the appropriate keyboard
- For number inputs, a specialized numeric keypad is shown
- The keyboard will close when clicking outside or when pressing the close button
