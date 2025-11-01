# Pour Choices MVP Document

**Version:** 3.4  
**Date:** October 19th, 2025  
**Author:** Brian Bapties  
**Designer:** Grok (Dream Team of xAI UX/UI Consultant, developers, and more.)

## Executive Summary

**Tagline:** "Picture Your Next Sip".

**Core Loops:** Onboard → search/add bottles → blind taste/rank → collect/manage, featuring Elo-based rankings (0-100 percentiles) and provisional user-added bottles to grow the shared database.

**Boundaries:** No passwords (cookie-based sessions for seamless access); static Elo in Must-have, evolving to calculated (user/global) in Should-have; defer AI photo recognition to Could-have for lean iteration.

**Philosophy:** Data-driven intuition—log all interactions (clicks, swipes, invalids, edges) anonymously for iterative UX refinements, fostering a seamless, personalized experience that feels like browsing a private whiskey vault on your phone. Scalable for post-MVP social sharing and AI expansions.

## Success Metrics

- >80% onboarding completion rate
- >50% user engagement in tastings
- Database growth via 20% provisional adds (tracked via minimal logging if in Could-have)

## Target Audience

- Whiskey enthusiasts (deep rankings/tastings)
- Casual collectors (inventory management)
- Social drinkers (discoveries and shares)

## Core Objectives

Enable login, collection management from shared DB, user-added bottles (provisional pending), blind tastings with auto Elo. Focus on delivering seamless mobile flows—e.g., one-tap onboarding to immediate search, fostering habit-forming loops.

## MoSCoW Prioritization

### Must-have
- Onboarding (quick sign-up/login via name/email, no passwords)
- Search/Add Bottles (text search, photo upload for adds)
- Blind Tastings (select 2-5 bottles, basic notes/ranking)
- Rankings (static Elo 0-100 embedded in cards)
- My Bar Collection (add/edit bottles, view list)

### Should-have
- Calculated Elo rankings (user-specific and global aggregates, updated post-tasting)

### Could-have
- Basic AI photo recognition (>70% confidence for auto-fill)
- Minimal logging (e.g., JSON events for UX tweaks)
- Toast notifications (e.g., "Added!" pop-ups)

### Won't-have
- Passwords
- Admin dashboard (post-MVP)
- Dynamic social features

## High-Level Features

### Onboarding/Login
Quick profile setup for seamless entry.
- Layout: Full-screen splash leading to centered modal form.
- Wireframe (Portrait Mobile View):
  ```
  [Full-Screen Splash]
  [Centered Header: "Welcome to Pour Choices"]
  [Tagline: "Picture Your Next Sip"]
  [Full-Width Button: "Start"]

  [Modal Overlay: Centered Form]
  [Input: "Name"]
  [Input: "Email"]
  [Full-Width Button: "Join"]
  ```

### Search/Add Bottles
Text-based discovery with provisional adds to grow DB.
- Layout: Top search bar above scrollable list, bottom-right FAB for photo/modal.
- Wireframe (Portrait Mobile View):
  ```
  [Top Search Bar: Full-width input]
  [Banner: "20 Results"]
  [Scrollable List: Slim cards]
    - [Thumbnail left | Name | Type | Elo Badge | Indicator]
  [Bottom-Right FAB: "+"]

## Backend APIs

- `GET /api/test-supabase` - Test Supabase connection, fetch 5 bottles
  ```

### Blind Tastings
Unbiased 2-5 bottle comparisons with notes and ranking.
- Layout: Full-screen modal with progress bar, collapsible sections, rank button.
- Wireframe (Portrait Mobile View):
  ```
  [Picker Screen: Centered Header "How Many Bottles?"]
  [Buttons: [2] [3] [4] [5]]

  [Taster Screen: Draggable cards A-E]
    - [Card A: Expand for Notes (Nose/Taste/Finish)]
  [Button: "Rankings Complete"]

  [Reveal Screen: Cascade flips from worst to best]
  ```

### Rankings
Custom Elo percentile rankings (0-100) for personalized/global insights.
- Layout: Embedded badges on cards, sortable list views.
- Wireframe: Badges shown as "88/92" on cards.

### My Bar Collection
Personal inventory tracking.
- Layout: Responsive grid of medium cards, swipe-right for edit.
- Wireframe (Portrait Mobile View):
  ```
  [Banner: "15 in Your Bar"]
  [Scrollable Grid: Medium cards]
    - [Image top | Name | Elo Badge | Swipe for Edit]
  [Bottom-Right FAB: "+"]
