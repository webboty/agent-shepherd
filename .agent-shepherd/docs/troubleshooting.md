# Agent Shepherd Troubleshooting Guide

This guide helps you diagnose and resolve common issues when working with Agent Shepherd.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [Policy Issues](#policy-issues)
- [Decision Agent Issues](#decision-agent-issues)
- [Transition Issues](#transition-issues)
- [Phase Messenger Issues](#phase-messenger-issues)
- [Retention and Cleanup Issues](#retention-and-cleanup-issues)
- [Loop Prevention Issues](#loop-prevention-issues)
- [Performance Issues](#performance-issues)
- [Integration Issues](#integration-issues)

---

## Installation Issues

### Issue: Installation Fails with Permission Denied

**Symptom:**
```
Permission denied when creating .agent-shepherd directory
```

**Causes:**
- Insufficient file system permissions
- Running installer as non-root user without proper permissions
- Protected system directory

**Solutions:**

1. **Check directory permissions:**
   ```bash
   ls -la . | grep agent-shepherd
   ```

2. **Run with appropriate permissions:**
   ```bash
   sudo bash install.sh  # Unix-like systems
   # or
   # Run as administrator on Windows (PowerShell)
   ```

3. **Use user directory if system directory protected:**
   ```bash
   mkdir -p ~/.local/share/agent-shepherd
   export AGENT_SHEPHERD_HOME=~/.local/share/agent-shepherd
   bash install.sh
   ```

---

### Issue: Dependencies Not Found

**Symptom:**
```
Error: Cannot find module 'bun', 'beads', or '@opencode-ai/sdk'
```

**Causes:**
- Dependencies not installed
- PATH not configured correctly
- Different installation paths

**Solutions:**

1. **Verify Bun installation:**
   ```bash
   bun --version
   ```

   If not found, install:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Verify Beads installation:**
   ```bash
   bd --version
   ```

   If not found, install:
   ```bash
   npm install -g @beads/cli
   ```

3. **Check PATH:**
   ```bash
   echo $PATH | tr ':' '\n' | grep -E '(bun|beads|agent-shepherd)'
   ```

   Add to PATH if missing:
   ```bash
   # For Bun
   export PATH="$HOME/.bun/bin:$PATH"

   # For Agent Shepherd binary
   export PATH="$HOME/.agent-shepherd/bin:$PATH"
   ```

4. **Verify package installation:**
   ```bash
   cd /path/to/agent-shepherd
   bun install
   ```

---

### Issue: Cross-Platform Compatibility Issues

**Symptom:**
- Scripts fail on Windows that work on macOS/Linux
- Path separators incorrect
- Shell command syntax errors

**Causes:**
- Using Unix-specific syntax on Windows
- Hardcoding forward slashes
- OS-specific APIs not handled

**Solutions:**

1. **Use Node.js path module in code:**
   ```typescript
   import { join, sep } from 'path';

   // Instead of: '.agent-shepherd/config.yaml'
   const configPath = join('.agent-shepherd', 'config', 'config.yaml');

   // Path separator automatically correct for OS
   console.log(sep); // '\\' on Windows, '/' on Unix
   ```

2. **Detect OS in shell scripts:**
   ```bash
   if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
     # Windows-specific commands
     cp config.yaml .agent-shepherd/config/
   else
     # Unix-specific commands
     cp config.yaml .agent-shepherd/config/
   fi
   ```

3. **Use PowerShell for Windows-specific tasks:**
   ```powershell
   # Use PowerShell built-ins instead of Unix commands
   Copy-Item config.yaml .agent-shepherd\config\
   ```

---

## Configuration Issues

### Issue: Config File Not Found

**Symptom:**
```
Error: Configuration file not found: .agent-shepherd/config/config.yaml
```

**Causes:**
- Agent Shepherd not initialized
- Config directory structure missing
- Working directory incorrect

**Solutions:**

1. **Initialize Agent Shepherd:**
   ```bash
   ashep init
   ```

2. **Verify directory structure:**
   ```bash
   ls -la .agent-shepherd/
   ls -la .agent-shepherd/config/
   ```

   Should contain:
   ```
   .agent-shepherd/
   ├── config/
   │   ├── config.yaml
   │   ├── policies.yaml
   │   ├── agents.yaml
   │   └── ...
   ```

3. **Check working directory:**
   ```bash
   pwd
   ```

   Ensure you're in the project root.

4. **Specify config path explicitly:**
   ```bash
   ashep worker --config /absolute/path/to/config.yaml
   ```

---

### Issue: Invalid Configuration Schema

**Symptom:**
```
Error: Invalid configuration: schema validation failed
```

**Causes:**
- Malformed YAML
- Wrong data types
- Missing required fields
- Invalid values (e.g., negative timeouts)

**Solutions:**

1. **Validate configuration:**
   ```bash
   ashep validate-config
   ```

2. **Check YAML syntax:**
   ```bash
   # Using Python
   python -c "import yaml; yaml.safe_load(open('.agent-shepherd/config/config.yaml'))"

   # Using yamllint (if installed)
   yamllint .agent-shepherd/config/config.yaml
   ```

3. **Review schema files:**
   - `.agent-shepherd/schemas/config.schema.json`
   - `.agent-shepherd/schemas/policies.schema.json`
   - `.agent-shepherd/schemas/agents.schema.json`

4. **Common fixes:**

   **Fix indentation:**
   ```yaml
   # Wrong
   policies:
     default:
       name: "Default"

   # Correct
   policies:
     default:
       name: "Default"
   ```

   **Fix data types:**
   ```yaml
   # Wrong - timeout should be number
   timeout_base_ms: "300000"

   # Correct
   timeout_base_ms: 300000
   ```

   **Fix required fields:**
   ```yaml
   # Wrong - missing required 'name' field
   policies:
     default:
       phases: [...]
   ```

5. **Use examples from schemas:**
   Check the `examples` section in schema files for valid configurations.

---

### Issue: Environment Variables Not Working

**Symptom:**
Configuration doesn't use environment variables

**Causes:**
- Incorrect variable names
- Variables not exported
- Syntax errors in config

**Solutions:**

1. **Set environment variables:**
   ```bash
   export OPENCODE_API_KEY="your-api-key"
   export BEADS_REPO_PATH="/path/to/repo"
   export AGENT_SHEPHERD_LOG_LEVEL="debug"
   ```

2. **Use in config files:**
   ```yaml
   # config/config.yaml
   opencode:
     api_key: ${OPENCODE_API_KEY}

   beads:
     repo_path: ${BEADS_REPO_PATH}

   logging:
     level: ${AGENT_SHEPHERD_LOG_LEVEL}
   ```

3. **Verify variables are set:**
   ```bash
   echo $OPENCODE_API_KEY
   ```

4. **Use .env files:**
   ```bash
   # Create .env
   cat > .env <<EOF
   OPENCODE_API_KEY=your-api-key
   BEADS_REPO_PATH=/path/to/repo
   EOF

   # Source it
   source .env
   ```

---

## Policy Issues

### Issue: Policy Not Matching Issues

**Symptom:**
```
Issue always uses default policy instead of matched policy
```

**Causes:**
- Issue type doesn't match any policy
- Priority conflicts
- Incorrect workflow label

**Solutions:**

1. **Check issue types in policies:**
   ```bash
   cat .agent-shepherd/config/policies.yaml | grep issue_types
   ```

2. **Verify issue type matches:**
   ```bash
   bd show issue-123 | grep issue_type
   ```

3. **Check policy priorities:**
   ```yaml
   policies:
     high-priority-policy:
       issue_types: ["bug"]
       priority: 80  # Higher priority

     medium-priority-policy:
       issue_types: ["bug"]
       priority: 50  # Lower priority (won't match)
   ```

4. **Use explicit workflow label:**
   ```bash
   bd update issue-123 --labels ashep-workflow:my-policy
   ```

5. **Verify policy exists:**
   ```bash
   ashep show-policies
   ```

---

### Issue: Policy Validation Fails

**Symptom:**
```
Error: Policy validation failed for 'my-policy'
```

**Causes:**
- Phase names missing or duplicated
- Invalid transitions
- Phase references nonexistent phase

**Solutions:**

1. **Validate policies:**
   ```bash
   ashep validate-policy-chain
   ```

2. **Check phase names are unique:**
   ```yaml
   # Wrong - duplicate phase names
   policies:
     my-policy:
       phases:
         - name: implement
         - name: implement  # Duplicate!
   ```

3. **Verify transition targets exist:**
   ```yaml
   # Wrong - 'deploy' phase doesn't exist
   policies:
     my-policy:
       phases:
         - name: test
           transitions:
             on_success: deploy  # Phase doesn't exist

       # Missing: deploy phase
   ```

4. **Fix transition validation:**

   **on_partial_success and on_unclear must be objects:**
   ```yaml
   # Wrong
   transitions:
     on_partial_success: "review"  # Can't be string

   # Correct
   transitions:
     on_partial_success:
       capability: "partial-decision"
       prompt: "Analyze partial success"
       allowed_destinations: ["review"]
   ```

5. **Use policy tree visualization:**
   ```bash
   ashep show-policy-tree my-policy
   ```

---

### Issue: Phase Timeout Not Working

**Symptom:**
- Phases run indefinitely without timeout
- Wrong timeout values used

**Causes:**
- timeout_base_ms not set
- timeout_multiplier incorrect
- Timeout handling not implemented

**Solutions:**

1. **Check timeout configuration:**
   ```yaml
   policies:
     my-policy:
       timeout_base_ms: 300000  # 5 minutes
       phases:
         - name: implement
           timeout_multiplier: 2.0  # 10 minutes total
   ```

2. **Calculate expected timeout:**
   ```bash
   # base * multiplier = total timeout
   300000 * 2.0 = 600000 ms (10 minutes)
   ```

3. **Verify timeout calculation:**
   ```typescript
   const policy = policyEngine.getPolicy('my-policy');
   const timeout = policyEngine.calculateTimeout('my-policy', 'implement');
   console.log('Timeout:', timeout, 'ms');
   ```

4. **Check stall threshold:**
   ```yaml
   policies:
     my-policy:
       stall_threshold_ms: 60000  # 1 minute
   ```

---

## Decision Agent Issues

### Issue: Decision Agent Not Responding

**Symptom:**
```
Timeout waiting for decision agent response
```

**Causes:**
- OpenCode not configured
- Agent not available
- Network issues
- Prompt too long

**Solutions:**

1. **Verify OpenCode configuration:**
   ```bash
   cat .agent-shepherd/config/config.yaml | grep -A 5 opencode
   ```

2. **Test OpenCode connection:**
   ```bash
   curl -H "Authorization: Bearer $OPENCODE_API_KEY" \
     https://api.opencode.ai/v1/agents
   ```

3. **Check agent availability:**
   ```bash
   ashep sync-agents
   ashep show-agents
   ```

4. **Increase timeout:**
   ```yaml
   # config/config.yaml
   opencode:
     timeout_ms: 120000  # 2 minutes
   ```

5. **Shorten prompt:**
   - Reduce phase history depth
   - Truncate long messages
   - Summarize context

---

### Issue: Decision Parsing Fails

**Symptom:**
```
Error: Failed to parse decision response: Invalid JSON
```

**Causes:**
- Malformed JSON response
- Missing required fields
- Invalid confidence value
- Wrong decision format

**Solutions:**

1. **Check raw response:**
   ```typescript
   const rawResponse = await callAgent(prompt);
   console.log('Raw response:', rawResponse);
   ```

2. **Validate response schema:**
   ```bash
   # Check decision.schema.json
   cat .agent-shepherd/schemas/decision.schema.json
   ```

3. **Common response fixes:**

   **Add JSON wrapper if missing:**
   ```json
   // AI might return:
   advance_to_test
   Reasoning: Tests passed
   Confidence: 0.95

   // Should be:
   {
     "decision": "advance_to_test",
     "reasoning": "Tests passed",
     "confidence": 0.95
   }
   ```

   **Fix confidence range:**
   ```json
   // Wrong
   {
     "confidence": 95  // Should be 0.0-1.0
   }

   // Correct
   {
     "confidence": 0.95
   }
   ```

   **Add required fields:**
   ```json
   // Missing 'reasoning'
   {
     "decision": "advance_to_test",
     "confidence": 0.95
   }

   // Correct
   {
     "decision": "advance_to_test",
     "reasoning": "Tests passed",
     "confidence": 0.95
   }
   ```

4. **Use sanitization:**
   ```typescript
   const sanitized = builder.sanitizeResponse(rawResponse);
   const parsed = builder.parseDecisionResponse(sanitized, allowedDestinations);
   ```

---

### Issue: Confidence Thresholds Not Working

**Symptom:**
- High confidence decisions still require approval
- Low confidence decisions auto-advance

**Causes:**
- Thresholds not set correctly
- Comparison logic wrong
- Threshold values swapped

**Solutions:**

1. **Check threshold configuration:**
   ```yaml
   policies:
     my-policy:
       phases:
         - name: test
           transitions:
             on_failure:
               capability: "test-decision"
               allowed_destinations: ["fix", "test", "review"]
               confidence_thresholds:
                 auto_advance: 0.85  # High confidence
                 require_approval: 0.60  # Medium confidence
   ```

2. **Verify threshold logic:**
   ```typescript
   // Correct logic
   if (confidence >= thresholds.auto_advance) {
     return { type: 'advance' };
   } else if (confidence >= thresholds.require_approval) {
     return { type: 'block', reason: 'Require approval' };
   } else {
     return { type: 'require_approval' };
   }
   ```

3. **Check confidence distribution:**
   ```typescript
   const analytics = builder.getAnalytics();
   console.log('Confidence distribution:', analytics.confidence_distribution);
   // Output: { high: 80, medium: 50, low: 20 }
   ```

4. **Adjust thresholds based on analytics:**
   - If too many require_approval, lower thresholds
   - If too many auto-advances, raise thresholds

---

## Transition Issues

### Issue: Infinite Loop in Transitions

**Symptom:**
Workflow never completes, cycles between phases

**Causes:**
- Transition always returns to same phase
- Cycle detection disabled
- Phase visit limits too high

**Solutions:**

1. **Enable cycle detection:**
   ```yaml
   # config/config.yaml
   loop_prevention:
     enabled: true
     cycle_detection_enabled: true
     cycle_detection_length: 3
   ```

2. **Check transition configuration:**
   ```yaml
   # Wrong - always returns to test
   phases:
     - name: test
       transitions:
         on_failure: implement
     - name: implement
       transitions:
         on_success: test  # Creates: test -> implement -> test
   ```

3. **Set max visit limits:**
   ```yaml
   phases:
     - name: test
       max_visits: 5  # Max 5 visits
   ```

4. **Check for oscillating cycles:**
   ```bash
   ashep detect-cycles issue-123
   ```

---

### Issue: Dynamic Decision Not Triggering

**Symptom:**
Transition configured as dynamic_decision but advances directly

**Causes:**
- Transitions block not defined
- Missing outcome type mapping
- Wrong configuration structure

**Solutions:**

1. **Verify transition configuration:**
   ```yaml
   # Correct configuration
   phases:
     - name: test
       transitions:
         on_failure:  # Must be object for dynamic decision
           capability: "test-decision"
           prompt: "Analyze failure"
           allowed_destinations: ["fix", "test", "review"]
   ```

2. **Check outcome type:**
   ```typescript
   const outcome = {
     success: false,
     result_type: 'failure'  // Matches on_failure
   };
   ```

3. **Verify transition key:**
   ```typescript
   // Check which transition key matches
   const transitionKey = getTransitionKey(outcome);
   console.log('Transition key:', transitionKey);
   // Output: 'on_failure', 'on_success', 'on_partial_success', 'on_unclear'
   ```

---

### Issue: Wrong Transition Taken

**Symptom:**
- Expected on_success but on_failure triggered
- Direct jump instead of AI decision

**Causes:**
- Success flag wrong
- Outcome type mismatched
- String instead of object in config

**Solutions:**

1. **Verify outcome success flag:**
   ```typescript
   const outcome = {
     success: true,  // Must be true for on_success
     message: 'Phase completed'
   };
   ```

2. **Check outcome type:**
   ```typescript
   const outcome = {
     success: false,
     result_type: 'partial_success'  // Triggers on_partial_success
   };
   ```

3. **Fix transition configuration:**
   ```yaml
   # Wrong - string instead of object
   transitions:
     on_failure:
       capability: "test-decision"  # Should be object

   # Correct
   transitions:
     on_failure:
       capability: "test-decision"
       prompt: "Analyze failure"
       allowed_destinations: ["fix", "test", "review"]
   ```

4. **Check transition logic:**
   ```typescript
   const transition = await policyEngine.determineTransition(
     'my-policy',
     'test',
     outcome,
     'issue-123'
   );
   console.log('Transition:', transition);
   ```

---

## Phase Messenger Issues

### Issue: Messages Not Being Delivered

**Symptom:**
- Sender sends message but receiver doesn't receive
- Messages not appearing in queries

**Causes:**
- Database connection issue
- Wrong phase names
- Message validation failure
- Size limits exceeded

**Solutions:**

1. **Check database status:**
   ```bash
   ls -la .agent-shepherd/messages.db
   ```

2. **Verify message was sent:**
   ```typescript
   const message = messenger.sendMessage({
     issue_id: 'issue-123',
     from_phase: 'test',
     to_phase: 'review',
     message_type: 'result',
     content: 'Test results'
   });
   console.log('Message sent:', message.id);
   ```

3. **Query for message:**
   ```typescript
   const messages = messenger.listMessages({
     issue_id: 'issue-123',
     to_phase: 'review'
   });
   console.log('Messages:', messages.length);
   ```

4. **Check size limits:**
   ```yaml
   # config/phase-messenger.yaml
   size_limits:
     max_content_length: 10000
     max_messages_per_issue: 500
   ```

5. **Check for errors:**
   ```typescript
   try {
     messenger.sendMessage({ ... });
   } catch (error) {
     console.error('Send failed:', error.message);
   }
   ```

---

### Issue: Messages Not Marked as Read

**Symptom:**
Unread count keeps increasing

**Causes:**
- Not marking as read when receiving
- Marking messages but not persisting
- Race condition

**Solutions:**

1. **Mark messages as read explicitly:**
   ```typescript
   const messages = messenger.receiveMessages(
     'issue-123',
     'review',
     true  // markAsRead = true
   );
   ```

2. **Verify read status:**
   ```typescript
   const messages = messenger.listMessages({
     issue_id: 'issue-123',
     read: true  // Only read messages
   });
   ```

3. **Check read_at timestamp:**
   ```typescript
   const messages = messenger.receiveMessages('issue-123', 'review');
   for (const msg of messages) {
     console.log('Read at:', msg.read_at);
   }
   ```

---

### Issue: Database Lock Error

**Symptom:**
```
Error: Database is locked
```

**Causes:**
- Multiple processes accessing database
- Transaction not committed
- Previous process crashed

**Solutions:**

1. **Close previous connections:**
   ```typescript
   // Ensure messenger is properly closed
   messenger.close();
   ```

2. **Check for running processes:**
   ```bash
   ps aux | grep ashep
   ```

3. **Use WAL mode (if persistent):**
   ```bash
   sqlite3 .agent-shepherd/messages.db "PRAGMA journal_mode=WAL;"
   ```

4. **Restart process:**
   ```bash
   pkill -f ashep
   ashep worker
   ```

---

## Retention and Cleanup Issues

### Issue: Cleanup Not Running

**Symptom:**
- Data keeps growing
- Old messages not archived
- No cleanup metrics

**Causes:**
- Cleanup not enabled
- Scheduler not configured
- Triggers not met

**Solutions:**

1. **Check cleanup configuration:**
   ```yaml
   # config/config.yaml
   retention:
     enabled: true
     cleanup_interval_hours: 24
     triggers:
       on_startup: false
       on_issue_complete: false
       on_schedule: true
       schedule: "0 2 * * *"  # Daily at 2 AM
   ```

2. **Verify retention policies:**
   ```bash
   ls -la .agent-shepherd/config/retention.yaml
   cat .agent-shepherd/config/retention.yaml
   ```

3. **Check if limits exceeded:**
   ```typescript
   const stats = messenger.getMessageStats();
   const needsCleanup = policyManager.needsCleanup(
     stats.total_messages,
     stats.db_size_mb * 1024 * 1024
   );
   console.log('Needs cleanup:', needsCleanup.needsCleanup);
   ```

4. **Trigger cleanup manually:**
   ```bash
   ashep cleanup --force
   ```

---

### Issue: Wrong Data Deleted

**Symptom:**
- Recent messages deleted
- Successful runs removed
- Important data lost

**Causes:**
- Age threshold too low
- Filters incorrect
- Keep flags not working

**Solutions:**

1. **Check age thresholds:**
   ```yaml
   policies:
     standard:
       age_days: 90  # Minimum 90 days
       archive_after_days: 60  # Archive before deletion
       delete_after_days: 365  # Keep archives for a year
   ```

2. **Verify keep flags:**
   ```yaml
   policies:
     standard:
       keep_successful_runs: true  # Never delete successful runs
       keep_failed_runs: true
   ```

3. **Check filters:**
   ```yaml
   policies:
     development:
       status_filter: ["closed"]  # Only delete closed issues
       phase_filter: ["review"]  # Only delete review phase
   ```

4. **Restore from archive:**
   ```bash
   # Check archive directory
   ls -la .agent-shepherd/messages_archive/

   # Restore from JSONL
   cat .agent-shepherd/messages_archive/issue-123.jsonl | \
     while IFS= read -r line; do
       echo "$line" >> .agent-shepherd/messages.jsonl
     done
   ```

---

### Issue: Archive Corruption

**Symptom:**
```
Error: Failed to parse archive: Invalid JSON
```

**Causes:**
- Incomplete write
- File system error
- Concurrent writes

**Solutions:**

1. **Check archive integrity:**
   ```bash
   # Validate JSONL
   python3 -c "
   import json
   for line in open('.agent-shepherd/messages_archive/issue-123.jsonl'):
       json.loads(line)
   print('Archive valid')
   "
   ```

2. **Fix corrupted archive:**
   ```bash
   # Filter out invalid lines
   cat .agent-shepherd/messages_archive/issue-123.jsonl | \
     jq -R 'fromjson? select(.)' > \
     .agent-shepherd/messages_archive/issue-123-fixed.jsonl
   ```

3. **Restore from database backup:**
   ```bash
   # If database backup exists
   cp .agent-shepherd/messages.db.backup \
      .agent-shepherd/messages.db
   ```

---

## Loop Prevention Issues

### Issue: False Positive Loop Detection

**Symptom:**
Workflow blocked for "oscillating cycle" when valid

**Causes:**
- Cycle detection too sensitive
- Normal back-and-forth detected as cycle
- Cycle length too short

**Solutions:**

1. **Adjust cycle detection length:**
   ```yaml
   # config/config.yaml
   loop_prevention:
     cycle_detection_length: 5  # Require 5 transitions
   ```

2. **Disable cycle detection:**
   ```yaml
   loop_prevention:
     cycle_detection_enabled: false
   ```

3. **Override block manually:**
   ```bash
   bd update issue-123 --status in_progress
   ```

---

### Issue: Max Visits Too Low

**Symptom:**
Workflow blocked after few legitimate visits

**Causes:**
- Default max_visits too low
- Complex workflow needs more iterations
- Debugging requires more passes

**Solutions:**

1. **Increase per-phase limit:**
   ```yaml
   phases:
     - name: test
       max_visits: 20  # Increase from default 10
   ```

2. **Increase global default:**
   ```yaml
   # config/config.yaml
   loop_prevention:
     max_visits_default: 20
   ```

3. **Use HITL to override:**
   ```bash
   bd update issue-123 --labels ashep-hitl:debugging
   ```

---

## Performance Issues

### Issue: Slow Policy Loading

**Symptom:**
Worker takes long time to start

**Causes:**
- Large policy files
- Complex validation
- I/O bottleneck

**Solutions:**

1. **Optimize policy file:**
   ```yaml
   # Remove unused policies
   policies:
     essential-policy:
       phases: [...]
     # Remove: old-unused-policy
   ```

2. **Cache parsed policies:**
   ```typescript
   // Engine already caches policies
   const engine = getPolicyEngine();
   // Subsequent calls are fast
   ```

3. **Use efficient storage:**
   - Keep config files on SSD
   - Use network storage if available

---

### Issue: High Memory Usage

**Symptom:**
Process consumes large amounts of memory

**Causes:**
- Unbounded message accumulation
- Large decision history
- No cleanup

**Solutions:**

1. **Check message stats:**
   ```typescript
   const stats = messenger.getMessageStats();
   console.log('Total messages:', stats.total_messages);
   console.log('DB size:', stats.db_size_mb, 'MB');
   ```

2. **Run cleanup:**
   ```bash
   ashep cleanup
   ```

3. **Adjust size limits:**
   ```yaml
   # config/phase-messenger.yaml
   size_limits:
     max_messages_per_issue: 100  # Reduce from 500
     max_messages_per_issue_phase: 20  # Reduce from 100
   ```

4. **Profile memory usage:**
   ```bash
   # Node.js memory profile
   node --max-old-space-size=4096 node_modules/ashep/bin/ashep worker

   # Or check current usage
   ps aux | grep ashep | awk '{print $6}'
   ```

---

## Integration Issues

### Issue: Beads Integration Not Working

**Symptom:**
Agent Shepherd can't read or update Beads issues

**Causes:**
- Beads not initialized
- Wrong repo path
- Permission issues

**Solutions:**

1. **Verify Beads initialization:**
   ```bash
   bd status
   ```

2. **Check repo path configuration:**
   ```bash
   cat .agent-shepherd/config/config.yaml | grep beads
   ```

3. **Test Beads commands:**
   ```bash
   bd ready
   bd show issue-123
   ```

4. **Reinitialize if needed:**
   ```bash
   bd init
   ```

---

### Issue: OpenCode Integration Fails

**Symptom:**
Agent Shepherd can't call OpenCode agents

**Causes:**
- Invalid API key
- Network connectivity
- Agent not registered

**Solutions:**

1. **Verify API key:**
   ```bash
   echo $OPENCODE_API_KEY | cut -c1-10
   ```

2. **Test API connectivity:**
   ```bash
   curl -H "Authorization: Bearer $OPENCODE_API_KEY" \
     https://api.opencode.ai/v1/agents
   ```

3. **Sync agents:**
   ```bash
   ashep sync-agents
   ```

4. **Check agent availability:**
   ```bash
   ashep show-agents
   ```

---

## Getting Help

### Debug Mode

Enable detailed logging:

```bash
# Enable debug logging
export AGENT_SHEPHERD_LOG_LEVEL=debug

# Run with debug output
ashep worker --debug
```

### Check Logs

```bash
# View recent logs
tail -f .agent-shepherd/logs/agent-shepherd.log

# Search for errors
grep ERROR .agent-shepherd/logs/agent-shepherd.log

# Search for specific issue
grep "issue-123" .agent-shepherd/logs/agent-shepherd.log
```

### Validate Configuration

```bash
# Validate all configs
ashep validate-config
ashep validate-policy-chain
ashep validate-policy-chain --detailed
```

### Get System Info

```bash
# Show system information
ashep info

# Show current configuration
ashep show-config
```

### Report Issues

If you encounter an issue not covered here:

1. Enable debug logging
2. Collect error messages
3. Run `ashep info`
4. Create issue with:
   - System info output
   - Error messages
   - Steps to reproduce
   - Configuration (sanitized)

---

## Additional Resources

- [API Documentation](./api-reference.md)
- [Integration Examples](./integration-examples.md)
- [Integration Guides](./integration-guides.md)
- [Architecture Documentation](./architecture.md)
