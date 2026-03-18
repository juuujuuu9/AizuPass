# QR Check-In System — User Guide

## What Is This?

QR Check-In is a simple, fast way to manage event registration using QR codes. Attendees receive a unique QR code when they register, and staff scan these codes at the door to check them in. No paper lists, no manual name lookups, just point and scan.

---

## For Attendees

### Getting Your QR Code

When you register for an event, you'll receive your QR code in one of these ways:

**By Email:**
- Check your inbox for an email with your QR code attached
- The email includes a PNG image you can save or screenshot
- Show this QR code at check-in

**On the Registration Page:**
- After submitting the RSVP form, you'll see your QR code displayed
- Tap the QR code for a full-screen version that's easier to scan
- Take a screenshot or save the image

### Tips for Easy Check-In

**Before you arrive:**
1. **Maximize your screen brightness** — Bright screens scan much faster
2. **Save the QR code** — Screenshot the email or save the image to your photos
3. **Don't crop the image** — The white space around the QR is important

**At check-in:**
1. Open your QR code (email, photo, or full-screen mode)
2. Hold your phone 4-6 inches from the staff member's scanner
3. Keep both phones steady for 1-2 seconds
4. If you see glare, tilt your phone slightly

**If scanning doesn't work:**
- Check your screen brightness is all the way up
- Clean your screen (smudges cause problems)
- Try the full-screen mode (tap the QR code)
- Ask staff to try manual lookup with your name or email

---

## For Event Staff

### Scanning QR Codes

**Using the Scanner:**
1. Open the scanner page on your phone
2. Tap "Start Scanning" to activate the camera
3. Ask the attendee to show their QR code
4. Hold your phone 4-6 inches from their screen
5. You'll hear a sound and see confirmation when it works

**Phone-to-Phone Tips:**
- Ask attendees to turn brightness to maximum
- Hold phones 4-6 inches apart (too close = blurry, too far = small)
- Avoid glare by tilting either phone if you see reflections
- The scanner works best in normal room light (not direct sunlight)

**Color Codes:**
- 🟢 **Green** — Check-in successful
- 🟡 **Yellow** — Already checked in (showing their details)
- 🔴 **Red** — Invalid code or error (try manual lookup)

### Manual Check-In (When QR Won't Scan)

If a QR code won't scan:
1. Tap "Manual Lookup" on the scanner page
2. Type the attendee's name or email
3. Tap their name in the results
4. Tap "Check In"

### Handling Common Issues

| Problem | Solution |
|---------|----------|
| "Invalid QR Code" | Ask attendee to refresh their email or re-send from admin panel |
| "Already Checked In" | Show them their check-in time, they may have forgotten |
| QR won't scan | Use manual lookup with their name/email |
| Scanner won't start | Check camera permissions in your browser settings |
| Offline mode active | Check-ins will sync when you reconnect to WiFi |

---

## For Event Administrators

### Setting Up an Event

**1. Create the Event:**
- Go to the Admin Dashboard
- Click "New Event"
- Enter event name (this appears in emails)
- Save

**2. Import Attendees:**
- Click "Import CSV" on your event
- Prepare a CSV file with identity data
- Required mapping contract:
  - **Email** must be mapped
  - map **both** first and last name, **or** map a **full-name fallback** column
- Upload the file and map headers in the import screen
- Optional: add any extra columns and choose your own field labels (saved in attendee `source_data`)
- Choose import behavior:
  - **Add new only**: skips rows where email already exists
  - **Merge/update existing**: updates existing attendee details by event+email
  - **Replace event roster**: deletes current event attendees, then imports CSV rows
- Review import summary and warnings (duplicates, malformed rows, encoding hints)
- Download skipped rows CSV if any rows were rejected

**CSV Format:**
```csv
email,first_name,last_name,company
alice@example.com,Alice,Smith,TechCorp
bob@example.com,Bob,Johnson,Design Inc
```

**3. Send QR Codes:**
- After importing, you'll see an option to "Send QR Codes via Email"
- This sends a QR code email to every imported attendee
- ⚠️ **Warning:** This sends actual emails to real people. Double-check your list first.
- Review the results to see sent/failed counts

### Managing Attendees

**Viewing Attendees:**
- Select your event from the dropdown on the admin dashboard
- See check-in status, company, dietary restrictions
- Search by name or email

**Checking Someone In Manually:**
- Find the attendee in the list
- Click the QR icon to show their code
- Staff can scan this, or you can mark them checked in

**Re-sending a QR Code:**
- Find the attendee, click the QR icon
- Click "Send QR Code to Email"
- Useful if someone lost their email

**Deleting an Attendee:**
- Find the attendee in the list
- Click the trash icon
- Confirm deletion (this cannot be undone)

### Exporting Data

**Export Attendees:**
- Select attendees (checkboxes) or select all
- Click "Export Selected"
- Downloads a CSV with all registration data
- Useful for post-event analysis or badge printing

### Understanding Check-In Statistics

**Check-in Rate:**
- Shows percentage of registered attendees who've checked in
- Updates in real-time as staff scan codes

**Offline Mode:**
- If staff lose internet, check-ins queue locally
- Data syncs automatically when connection returns
- You'll see an "offline mode" indicator when this happens

---

## Troubleshooting

### Attendees Can't Find Their QR Code

**Check:**
1. Did they check their spam/promotions folder?
2. Did they register with a different email?
3. Is the email still sending? (Large lists take time)

**Fix:**
- Use admin panel to re-send individual QR codes
- Or look them up manually at check-in

### QR Codes Won't Scan

**Attendee phone issues:**
- Screen brightness too low
- Screen protector causing glare
- QR code image is cropped (missing white border)
- Phone screen is cracked or very dirty

**Staff scanner issues:**
- Camera lens dirty
- Too much glare from lights
- Holding phones too close or too far

### Email Not Sending

**Check configuration:**
- Verify `RESEND_API_KEY` is set in environment
- Check `FROM_EMAIL` is verified in Resend dashboard
- Resend free tier only sends to your own email until domain is verified

**Bulk email failed partially:**
- Review the results summary
- Some emails may fail due to invalid addresses
- Re-send to failed addresses individually

### Duplicate Registrations

CSV import dedupes by **event + email**:
- Same email in one file twice → later rows are skipped
- Add mode + import same file twice → existing rows are skipped
- Merge mode + import same file twice → existing rows are updated
- Replace mode always rebuilds the event roster from the uploaded CSV
- Check import summary for imported/updated/deleted/skipped counts and warnings

---

## Security & Privacy

**What we store:**
- Name, email, phone, company (if provided)
- Check-in time and device
- QR token (random, single-use per event)

**What we don't do:**
- Share attendee data with third parties
- Store QR codes as images (we generate them on-demand)
- Allow unlimited QR scans (each check-in is logged)

**Staff access:**
- Staff can only see attendees for their assigned event
- Scanner doesn't show full lists (privacy protection)
- Admin access should be limited to organizers

---

## Quick Reference

| Task | How To |
|------|--------|
| Register for event | Fill out RSVP form on event page |
| Get QR code | Check email or save from confirmation page |
| Check in | Show QR to staff scanner |
| Lost QR code | Ask staff to look you up manually |
| Create event | Admin → New Event |
| Import attendees | Admin → Import CSV |
| Send QR emails | Import → "Send QR Codes via Email" |
| Check someone in | Scanner → point at their QR |
| Fix failed email | Admin → find attendee → resend QR |

---

## Getting Help

If something isn't working:
1. Check this guide for the relevant section
2. Try the troubleshooting steps listed
3. Contact your event administrator
4. For technical issues, check that the scanner has camera permissions

---

*Last updated: March 2026*
