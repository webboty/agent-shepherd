/**
 * Hello World Plugin for Agent Shepherd
 *
 * This plugin demonstrates basic plugin development concepts:
 * - Command registration
 * - Argument handling
 * - Async operations
 * - Error handling
 * - Different output styles
 */

async function hello() {
  console.log("Hello, World!");
  console.log("Welcome to Agent Shepherd plugin development!");
}

async function greet(name, style = "normal") {
  if (!name) {
    console.error("Usage: ashep greet <name> [style]");
    console.error("Styles: normal, formal, casual, excited");
    console.error("Example: ashep greet Alice excited");
    process.exit(1);
  }

  let greeting;

  switch (style.toLowerCase()) {
    case "formal":
      greeting = `Greetings, ${name}. It is a pleasure to make your acquaintance.`;
      break;
    case "casual":
      greeting = `Hey ${name}! What's up?`;
      break;
    case "excited":
      greeting = `OMG ${name}!!! So awesome to see you!!! 🎉`;
      break;
    case "normal":
    default:
      greeting = `Hello, ${name}!`;
      break;
  }

  console.log(greeting);
}

async function countdown(startNumber) {
  const num = parseInt(startNumber, 10);

  if (isNaN(num) || num < 1 || num > 20) {
    console.error("Usage: ashep countdown <number>");
    console.error("Number must be between 1 and 20");
    console.error("Example: ashep countdown 5");
    process.exit(1);
  }

  console.log(`Starting countdown from ${num}...`);

  for (let i = num; i > 0; i--) {
    console.log(i);
    // Small delay to make countdown visible
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log("🎉 Countdown complete! 🎉");
}

module.exports = {
  'hello': hello,
  'greet': greet,
  'countdown': countdown
};