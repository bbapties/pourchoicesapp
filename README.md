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

### Users
- `POST /api/users` - Create a new user
  - Payload: `{ "name": "string", "email": "string" }`
  - Response: User object with id, name, email, created_at
  - Example: `curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"John Doe","email":"john@example.com"}'`

- `GET /api/users` - List all users (for testing)
  - Response: Array of user objects
  - Example: `curl http://localhost:3000/api/users`

### Bottles
- `POST /api/bottles` - Add a new bottle
  - Payload: `{ "name": "string", "type": "string" }`
  - Response: Bottle object with id, name, type, provisional=true, created_at
  - Example: `curl -X POST http://localhost:3000/api/bottles -H "Content-Type: application/json" -d '{"name":"Macallan 12","type":"Single Malt Scotch"}'`

- `GET /api/bottles` - Search bottles by name
  - Query params: `?q=search_term` (optional)
  - Response: Array of bottle objects
  - Example: `curl "http://localhost:3000/api/bottles?q=macallan"`

### Tastings
- `POST /api/tastings` - Record a tasting session
  - Payload: `{ "user_id": "string", "bottle_ids": ["string"], "notes": "string", "winner_bottle_id": "string" }`
  - Response: Tasting object with id, user_id, bottle_ids, notes, winner_bottle_id, created_at
  - Example: `curl -X POST http://localhost:3000/api/tastings -H "Content-Type: application/json" -d '{"user_id":"123","bottle_ids":["456","789"],"notes":"Great tasting!","winner_bottle_id":"456"}'`

- `GET /api/tastings` - Get user's tastings
  - Query params: `?user_id=user_id` (required)
  - Response: Array of tasting objects
  - Example: `curl "http://localhost:3000/api/tastings?user_id=123"`

### Test Route
- `GET /api/test-supabase` - Test Supabase connection, fetch 5 bottles

### Authentication
- `POST /api/auth/signup` - Create a new user account
  - Payload: `{ "username": "string", "email": "string", "password": "string" }`
  - Response: User object with user_id, username, email
  - Example: `curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d '{"username":"johndoe","email":"john@example.com","password":"securepassword"}'`

- `POST /api/auth/login` - Sign in an existing user
  - Payload: `{ "email": "string", "password": "string" }`
  - Response: User object with id, username, email
  - Example: `curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"john@example.com","password":"securepassword"}'`

- `POST /api/auth/logout` - Sign out the current user
  - Response: Success message
  - Example: `curl -X POST http://localhost:3000/api/auth/logout`

- `GET /api/auth/me` - Get current user information
  - Response: User object or null if not authenticated
  - Example: `curl http://localhost:3000/api/auth/me`

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
