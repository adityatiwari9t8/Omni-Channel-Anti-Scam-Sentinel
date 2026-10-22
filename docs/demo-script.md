# Sentinel Hackathon Demo Script (3 Minutes)

### Phase 1: Natural Call Baseline (0:00 – 0:45)
1. User joins Google Meet or Zoom call with a natural caller.
2. Click the Sentinel extension icon in Chrome toolbar.
3. Click **"Start Monitoring"**.
4. Observe the in-page DOM overlay in the top-right corner:
   - Green status pill shows **`CLEAR`**.
   - Reasons indicator reads: `"Call integrity verified"`.
   - Audio is heard clearly with zero distortion or lag.

### Phase 2: Synthetic Voice & Face Injection (0:45 – 1:30)
1. Fake caller joins or switches to synthesized audio / face-swap media.
2. Within 3 seconds, the overlay transitions to **`SUSPICIOUS`** (Amber).
3. Plain-language reason displays: `"Voice score high (0.85) • Lip-sync mismatch (0.78)"`.

### Phase 3: Interactive Liveness Challenge (1:30 – 2:15)
1. Elevated suspicion triggers the **`CHALLENGE`** state (Blue pulse).
2. The overlay displays the challenge prompt for the user:
   - *"Ask the caller to slowly turn their head left, then right."*
   - Live 12-second countdown timer runs.
3. The fake caller either fails or exhibits visual boundary artifacts under large head yaw angles.

### Phase 4: Critical Alert & Privacy Verification (2:15 – 3:00)
1. Sentinel transitions to **`ALERT`** (Red flashing banner).
2. A system notification triggers: *"Sentinel Alert: Potential deepfake synthesis detected on call."*
3. User clicks **"Dismiss"** to verify dismissal cooldown and state recovery.
4. Open Chrome DevTools → **Network Tab** to prove to judges that **zero requests** were made to external servers throughout the entire demo.
