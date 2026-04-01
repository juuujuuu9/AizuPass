# Cursor Rules — QR Code Check-In Project

This document consolidates all Cursor rules for the project. These rules guide AI assistance to maintain consistency with project standards.

---

## Rule 1: Project Standards (Always Apply)

**File:** `.cursor/rules/project-standards.mdc`

### Mission

You are a pragmatic, senior-level engineer. Your guiding star is **Radical Simplicity**. You solve today's problems with the most direct, boring code possible. You are a scout for patterns; you proactively flag technical debt and suggest rule evolutions.

### Core Philosophy

- **Simple > Clever**: If it looks "smart," it's probably too complex.
- **The 10% Rule**: If an abstraction (helper/wrapper) takes more lines to write than the logic it replaces, it must be justified by 3+ use cases.
- **Explicit > Implicit**: No "magic" behaviors or hidden side effects.
- **Delete > Add**: Code is a liability. Removal is a high-value feature.

### Rule Update System

Use inline annotations to manage the evolution of this project's standards:

- `// RULE-CANDIDATE: [description]` — Use when you see a pattern repeating 3+ times.
- `// RULE-QUESTION: [id]` — Use if a rule feels outdated or hinders speed.
- `// RULE-VIOLATION: [id] Reason: [text] Expires: [date]` — Use for intentional technical debt.

### Dependencies (pnpm)

This project uses **pnpm** with a committed lockfile. Vercel and other CI environments install with an effective **frozen lockfile** (`pnpm install` refuses to proceed if `pnpm-lock.yaml` does not match `package.json`).

- Whenever you add, remove, or bump a dependency in `package.json`, run **`pnpm install`** locally so **`pnpm-lock.yaml` is updated**, and **commit the lockfile in the same change** as the manifest edit (or in the same PR).
- Before pushing dependency work, verify with **`pnpm install --frozen-lockfile`** (or let CI do it); if it fails, the lockfile is stale.

### Commits

- **No tool attribution in commit messages** — Do not add lines like `Made-with: Cursor` or similar footers. Keep messages to conventional subject + body only.
- This repo ships **`.githooks/commit-msg`**, which strips `Made-with:` lines if hooks are enabled. One-time per clone: **`git config core.hooksPath .githooks`** (repo-local, not global).

---

## Rule 2: Master Plan (Always Apply)

**File:** `.cursor/rules/master-plan.mdc`

### Master Plan (`docs/MASTER-PLAN.md`)

- **Single source of truth:** The dev checklist and roadmap live in [docs/MASTER-PLAN.md](docs/MASTER-PLAN.md). When discussing "what's next," "gap list," or "roadmap," refer to that file.
- **When completing work** that matches a checklist item: update [docs/MASTER-PLAN.md](docs/MASTER-PLAN.md) — set the item to `[x]`, add a brief Done note if useful, and update the **Last updated** date at the top.
- **When adding or changing** implementation steps that affect the roadmap: update the master plan (concern audit table and/or implementation order) so it stays accurate.
- **Other docs** (e.g. STEP-1-QR-SECURITY-PLAN.md) implement specific items; they should reference the master plan for overall order and next steps.

---

## Rule 3: UI Modernization (Applies to: `src/**/*.{tsx,astro,css}`)

**File:** `.cursor/rules/ui-modernization.mdc`

### QR Check-In UI Modernization — Cursor Implementation Plan

#### Overview

Transform the current admin dashboard into a high-retention, modern SaaS UI. Reference files in `docs/ui-modernization/` for detailed specifications.

#### Phase 1: Foundation (Do First)

##### 1. Create Component Files

Create these new files in `src/components/ui/`:

**StatusBadge.tsx**
- Copy from `docs/ui-modernization/qr-ui-components.tsx` → StatusBadge section
- Props: `{ status: 'pending' | 'checked-in' | 'error' }`
- Uses: Tailwind badge colors with semantic meaning

**EmptyState.tsx**
- Copy from `docs/ui-modernization/qr-ui-components.tsx` → EmptyState section
- Props: `{ onAddAttendee: () => void, onImportCSV: () => void }`
- Uses: Centered layout with illustration, two CTA buttons

##### 2. Update Global Styles

**File:** `src/styles/global.css`
- Append contents from `docs/ui-modernization/qr-ui-animations.css`
- This adds: status flip animations, QR breathing effect, live indicator pulse, skeleton loading

##### 3. Add Utility Helper

**File:** `src/lib/formatters.ts` (new)
```typescript
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
```

#### Phase 2: Table Modernization

##### Update Attendee Table Row

**File:** `src/components/AdminDashboard.tsx` or your attendee row component

**Changes:**
1. Add `group` class to table row (`<tr>`)
2. Replace status text with `<StatusBadge status={...} />`
3. Wrap action buttons in:
   ```tsx
   <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
   ```
4. Add avatar initials (gradient background):
   ```tsx
   <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
     {initials}
   </div>
   ```
5. Replace timestamp with `formatRelativeTime()` helper

##### Add Empty State

In the attendee list render, add:
```tsx
{attendees.length === 0 ? (
  <EmptyState onAddAttendee={...} onImportCSV={...} />
) : (
  <table>...</table>
)}
```

#### Phase 3: Stats & Header

##### Typography Hierarchy

**In your main admin page/layout:**
```tsx
<div className="mb-6">
  <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
    Attendees
  </h1>
  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
    {attendees.length} registered · {checkedInCount} checked in
  </p>
</div>
```

##### Stats Cards

**Create:** `src/components/StatCard.tsx`
- Copy from `docs/ui-modernization/qr-ui-components.tsx` → StatCard section

**Create:** `src/components/CheckInProgress.tsx`
- Copy from `docs/ui-modernization/qr-ui-components.tsx` → CheckInProgress section
- This is the donut chart showing check-in progress

**Add to page:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
  <StatCard label="Total Attendees" value={attendees.length} />
  <StatCard label="Checked In" value={checkedInCount} />
  <CheckInProgress checkedIn={checkedInCount} total={attendees.length} />
</div>
```

#### Phase 4: Search Enhancement

##### Global Search Component

**Create:** `src/components/GlobalSearch.tsx`
- Copy from `docs/ui-modernization/qr-ui-components.tsx` → GlobalSearch section
- Features: Cmd+K shortcut, focus ring, keyboard hint

**Integration:**
1. Replace existing search input
2. Add keyboard handler:
   ```tsx
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
         e.preventDefault();
         document.getElementById('global-search')?.focus();
       }
     };
     document.addEventListener('keydown', handleKeyDown);
     return () => document.removeEventListener('keydown', handleKeyDown);
   }, []);
   ```

#### Phase 5: Dark Mode (Optional but Recommended)

##### Add Theme Toggle

**Create:** `src/components/ThemeToggle.tsx`
```tsx
export function ThemeToggle() {
  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      <span className="hidden dark:inline">🌙</span>
      <span className="dark:hidden">☀️</span>
    </button>
  );
}
```

##### Update Layout

**In your root layout:**
```tsx
<html class="dark"> // Or make it dynamic based on user preference
```

#### Implementation Order (Critical)

Follow this exact order to avoid breaking changes:

1. **Create utility files** (`formatters.ts`, animations.css)
2. **Create UI primitives** (StatusBadge, EmptyState)
3. **Update table rows** (add hover actions, badges, avatars)
4. **Add empty state** conditional
5. **Update header typography**
6. **Add stats cards** (if applicable)
7. **Add search component**
8. **Add dark mode** (optional)

#### Testing Checklist

After each phase, verify:
- [ ] Light mode looks correct
- [ ] Dark mode looks correct (if implemented)
- [ ] Hover actions appear/disappear smoothly
- [ ] Empty state shows when no attendees
- [ ] Cmd+K focuses search
- [ ] Table is still functional (edit/delete work)
- [ ] Mobile layout stacks correctly

#### Reference

- Full component code: `docs/ui-modernization/qr-ui-components.tsx`
- Animation styles: `docs/ui-modernization/qr-ui-animations.css`
- Architecture: `docs/ui-modernization/qr-ui-architecture.md`
- Detailed roadmap: `docs/ui-modernization/qr-ui-implementation-roadmap.md`

---

## Summary

| Rule | File | Scope | Always Apply |
|------|------|-------|--------------|
| Project Standards | `project-standards.mdc` | All files | Yes |
| Master Plan | `master-plan.mdc` | All files | Yes |
| UI Modernization | `ui-modernization.mdc` | `src/**/*.{tsx,astro,css}` | No |

---

*Generated on: March 28, 2026*
