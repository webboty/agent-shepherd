# Hello World Plugin

The Hello World plugin is a comprehensive example demonstrating Agent Shepherd plugin development concepts. It provides three commands that showcase different aspects of plugin functionality.

## Overview

This plugin serves as a learning tool for plugin developers, demonstrating:

- **Command Registration**: How to define and export commands
- **Argument Handling**: Processing command-line arguments
- **Optional Parameters**: Using default values and switches
- **Error Handling**: Proper error messages and exit codes
- **Async Operations**: Using promises and delays
- **User Interaction**: Different output styles and formatting

## Commands

### `ashep hello`

Prints a simple greeting message.

**Usage:**
```bash
ashep hello
```

**Output:**
```
Hello, World!
Welcome to Agent Shepherd plugin development!
```

**Purpose:** Demonstrates the simplest form of command implementation with no arguments.

### `ashep greet <name> [style]`

Greets a specific person with optional styling.

**Usage:**
```bash
ashep greet Alice
ashep greet Bob formal
ashep greet Charlie casual
ashep greet Dana excited
```

**Parameters:**
- `name` (required): The person to greet
- `style` (optional): Greeting style - `normal`, `formal`, `casual`, `excited`

**Examples:**

**Normal greeting:**
```bash
ashep greet Alice
# Output: Hello, Alice!
```

**Formal greeting:**
```bash
ashep greet Dr.Smith formal
# Output: Greetings, Dr.Smith. It is a pleasure to make your acquaintance.
```

**Casual greeting:**
```bash
ashep greet Mike casual
# Output: Hey Mike! What's up?
```

**Excited greeting:**
```bash
ashep greet Sarah excited
# Output: OMG Sarah!!! So awesome to see you!!! 🎉
```

**Error handling:**
```bash
ashep greet
# Output:
# Usage: ashep greet <name> [style]
# Styles: normal, formal, casual, excited
# Example: ashep greet Alice excited
```

### `ashep countdown <number>`

Counts down from a specified number with visual feedback.

**Usage:**
```bash
ashep countdown 5
ashep countdown 10
```

**Parameters:**
- `number` (required): Starting number (1-20)

**Examples:**

**Countdown from 5:**
```bash
ashep countdown 5
# Output:
# Starting countdown from 5...
# 5
# 4
# 3
# 2
# 1
# 🎉 Countdown complete! 🎉
```

**Error handling:**
```bash
ashep countdown
# Output:
# Usage: ashep countdown <number>
# Number must be between 1 and 20
# Example: ashep countdown 5

ashep countdown 25
# Output:
# Usage: ashep countdown <number>
# Number must be between 1 and 20
# Example: ashep countdown 5
```

## Implementation Details

### Plugin Structure

```
hello-world/
├── manifest.json    # Plugin metadata and command definitions
├── index.js         # Command implementations
└── README.md        # This documentation
```

### manifest.json

```json
{
  "name": "hello-world",
  "description": "Example plugin demonstrating basic Agent Shepherd plugin development",
  "version": "1.0.0",
  "commands": [
    {
      "name": "hello",
      "description": "Print a greeting message"
    },
    {
      "name": "greet",
      "description": "Greet a specific person with optional style"
    },
    {
      "name": "countdown",
      "description": "Count down from a number"
    }
  ],
  "author": "Agent Shepherd Team",
  "license": "MIT"
}
```

### index.js Structure

```javascript
// Simple command without arguments
async function hello() {
  console.log("Hello, World!");
}

// Command with required and optional arguments
async function greet(name, style = "normal") {
  // Argument validation
  if (!name) {
    console.error("Usage: ashep greet <name> [style]");
    process.exit(1);
  }

  // Command logic with style variations
  // ...
}

// Command with input validation and async operations
async function countdown(startNumber) {
  // Input validation
  const num = parseInt(startNumber, 10);
  if (isNaN(num) || num < 1 || num > 20) {
    console.error("Usage: ashep countdown <number>");
    process.exit(1);
  }

  // Async countdown with delays
  for (let i = num; i > 0; i--) {
    console.log(i);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Export command handlers
module.exports = {
  'hello': hello,
  'greet': greet,
  'countdown': countdown
};
```

## Key Concepts Demonstrated

### 1. Command Registration

Commands are registered by:
- Defining them in `manifest.json` with name and description
- Implementing handler functions in `index.js`
- Exporting handlers in the module.exports object

### 2. Argument Handling

- **No arguments**: Simple functions like `hello()`
- **Required arguments**: Check for presence and show usage on error
- **Optional arguments**: Use default parameters `style = "normal"`
- **Validation**: Parse and validate input, exit with error code on invalid input

### 3. Error Handling

- **Usage messages**: Clear instructions when arguments are missing/invalid
- **Exit codes**: Use `process.exit(1)` for errors, let function return for success
- **User-friendly messages**: Explain what went wrong and how to fix it

### 4. Async Operations

- All command handlers are `async` functions
- Use `await` for operations like delays, file I/O, network requests
- Return naturally or exit explicitly for errors

### 5. User Experience

- **Clear output**: Use console.log() for normal output, console.error() for errors
- **Visual feedback**: Emojis and formatting for better UX
- **Progressive disclosure**: Show progress for long-running operations

## Development Best Practices

### Plugin Development

1. **Start Simple**: Begin with basic commands like `hello`
2. **Add Arguments**: Gradually introduce required and optional parameters
3. **Handle Errors**: Always validate input and provide helpful error messages
4. **Test Thoroughly**: Try all argument combinations and edge cases

### Code Quality

1. **Consistent Style**: Follow the existing codebase patterns
2. **Documentation**: Comment complex logic and edge cases
3. **Error Messages**: Make error messages actionable and specific
4. **Performance**: Consider long-running operations and provide feedback

### User Experience

1. **Helpful Errors**: Guide users toward correct usage
2. **Progress Feedback**: Show progress for operations taking >1 second
3. **Consistent Output**: Use similar formatting across commands
4. **Unicode Support**: Feel free to use emojis for visual appeal

## Testing the Plugin

After creating the plugin, test it thoroughly:

```bash
# Test basic functionality
ashep hello

# Test argument handling
ashep greet "Your Name"
ashep greet "Your Name" formal
ashep greet "Your Name" casual
ashep greet "Your Name" excited

# Test error cases
ashep greet  # Missing argument
ashep greet "Name" invalid  # Invalid style

# Test countdown
ashep countdown 3
ashep countdown 10

# Test countdown errors
ashep countdown  # Missing argument
ashep countdown abc  # Invalid number
ashep countdown 100  # Number too large
```

## Next Steps

Once you understand this plugin:

1. **Create Your Own**: Copy this structure and modify for your needs
2. **Add More Commands**: Extend with additional functionality
3. **Explore Advanced Features**: Add file I/O, network calls, or complex logic
4. **Contribute Back**: Share useful plugins with the community

## Related Documentation

- [Plugin System Overview](../../docs/plugin-system.md) - Complete plugin development guide
- [OpenSpec Plugin](../openspec/README.md) - Real-world plugin example
- [Agent Shepherd CLI](../../docs/cli-reference.md) - CLI command reference