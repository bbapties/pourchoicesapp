# Pour Choices - MVP Document

**Last Updated: December 20, 2025**

## 1. Executive Summary

Pour Choices is a mobile-first web application for spirits enthusiasts to discover, rate, and collection alcoholic beverages using an Elo-based ranking system. The app leverages Supabase for backend services and Next.js for the frontend.

## 2. Objectives

- Create an engaging platform for beverage discovery
- Implement a fair, comparative rating system
- Provide a comprehensive database of spirits
- Build a community-driven content experience

## 3. Target Audience

- Adult beverage enthusiasts (21+)
- Whiskey collectors and connoisseurs
- Manufacturers/distilleries for visibility

## 4. Workflows

### User Registration & Authentication
**Status: Completed**
- Email/password signup and login implemented
- Session management with Supabase
- Protected routes via middleware
- Profile creation with user collection

### Spirit Discovery & Browsing
**Status: Completed**
- Advanced search functionality across bottle attributes across multiple fields
- Global rankings display with percentile calculations
- Visual bottle cards with images and details
- Provisional bottle addition via persistent FAB button during search
- "Bottle not found" page without conditional button, replaced by FAB

### Collection Management (My Bar)
**Status: Not Implemented**
- User personal collection management planned
- Grid layout for owned bottles
- Collection analytics not started

### Tasting Flow
**Status: Not Implemented**
- Blind tasting interface development pending
- Elo calculation updates based on comparisons

### Profile Management
**Status: Not Implemented**
- User profile customization not started

## 5. Technical Stack

**Frontend:**
- Next.js 15 with React 19
- Tailwind CSS for styling
- Radix UI components
- Supabase client for API interactions

**Backend:**
- Supabase for database and auth
- PostgreSQL with custom views and functions
- Elo calculation system in database

**Deployment:**
- Vercel for hosting
- Node.js >=18.17.0 required

**Dependencies:**
- TypeScript for type safety
- React Hook Form with Zod validation
- Sonner for notifications

## 6. User Stories & Acceptance Criteria

### 6.1 Authentication - Signup
As a user, I want to sign up with email and password so I can create an account.
- Email validation
- Password requirements
- Account creation in database
- Welcome flow
**Status: Completed: Fully functional signup with form validation and database insertion.**

### 6.2 Authentication - Login
As a user, I want to log in with email and password so I can access my account.
- Credential verification
- Session persistence
- Protected routes
- Logout functionality
**Status: Completed: Working login with session management and auth state.**

### 6.3 Navigation & Shell
As a user, I want consistent navigation between app sections.
- Bottom navigation bar
- Active state indicators
- Protected routes for logged-in users
**Status: Completed: AppShell with Lucide icons and auth guards.**

### 6.4 Landing/Home Page
As a logged-in user, I want a welcoming home screen.
- Personalized welcome message
- Quick access to main features
- User name display
**Status: Completed: Simple welcome page showing user info.**

### 6.5 Search Bottles
As a user, I want to search for bottles by various criteria.
- Text search across name, distillery, category
- Debounced search for performance
- Real-time results display
**Status: Completed: Advanced search with multiple field matching and debouncing.**

### 6.6 View Bottle Details
As a user, I want to see comprehensive bottle information.
- Name, distillery, category, style
- Image display with fallback
- Elo rating and global rank percentile
- Provisional status indicator
**Status: Completed: BottleCard component with all required details.**

### 6.7 Global Rankings System
As a user, I want to understand bottle quality through rankings.
- Elo-based algorithm implementation
- Percentile calculations
- Global bottle ordering **Needs to be reverse order to show best or lowest % at top**
- Visual progress indicators
**Status: Completed: Elo calculations and percentile display implemented.**

### 6.8 Add New Bottle
As a user, I want to add bottles not in the database.
- Provisional bottle creation
- Form validation for required fields
- Persistent FAB button (48x48px, amber-600) appears when search query > 0, replacing old conditional button
- "Bottle not found" page retains text, no button
- Image upload (planned)
- Submission for review
**Status: PartiallyCompleted: ProvisionalSheet with FAB integration, form handling, and database insertion implemented; review process not implemented.**

### 6.9 Manage My Collection
As a user, I want to build and view my personal bottle collection.
- Add bottles to personal bar
- Grid view of owned bottles
- Collection statistics
**Status: Pending: My Bar page is placeholder only.**

### 6.10 Participate in Blind Tastings
As a user, I want to rate bottles through comparative tastings.
- Head-to-head comparisons
- Elo score updates
- Rating history tracking
**Status: Pending: Taste page is placeholder only.**

### 6.11 Custom Profile Management
As a user, I want to personalize my profile.
- Update username/avatar
- View stats and achievements
- Preferences settings
**Status: Pending: Profile page is placeholder only.**

### 6.12 Mobile-Optimized Experience
As a mobile user, I want touch-friendly interactions.
- Thumb-friendly buttons and navigation
- Responsive design for small screens
- Touch gestures and scrolling
**Status: Completed: Tailwind responsive classes implemented throughout.**

### 6.13 Browse Categories & Styles
As a user, I want to explore spirits by type and style.
- Category filtering in search
- Style-based navigation
- Discovery recommendations
**Status: Partially: Category dropdown implemented, but filtering not fully advanced.**

### 6.14 View Detailed Bottle Attributes
As a user, I want comprehensive bottle metadata.
- Age, batch, notes, extras
- Store pick information
- Detailed descriptions
**Status: Started: All attributes added to backe-end, but have not implamented bottle details card.**

### 6.15 Provisional Bottle Workflow
As a community contributor, I want my submissions reviewed.
- Submission for admin review
- Status tracking (provisional → verified)
- Notification system for approval
**Status: Partially Completed: Bottle marked provisional, review process not implemented.**

### 6.16 Elo Score Visualization
As a user, I want intuitive ranking displays.
- Percentile representation
- Global positioning
- Ranking badges or indicators
**Status: Completed: Percentile calculation and display.**

### 6.17 Search Performance
As a user, I want fast, reliable searches.
- Instant results with debouncing
- Loading states for UX
- Minimum 50 results per page
**Status: Completed: Debounced search with skeletons implemented.**

### 6.18 Error Handling
As a user, I want graceful error management.
- Network failure handling
- Form validation errors
- User-friendly error messages
**Status: Partially: Basic error handling in search and auth.**

### 6.19 Data Persistence
As a user, I want my data to persist across sessions.
- Session storage for auth
- Database-backed collections
- Cached search results
**Status: Completed: Supabase handles persistence for auth and data.**

### 6.20 Offline Capability
As a user, I want to browse cached content offline.
- Service worker implementation
- Cached bottle data
- Network status detection
**Status: Pending: No offline functionality implemented.**

## 7. Success Metrics

**Current Status:**
- User acquisition (tracking: Not implemented - Need analytics setup)
- Search engagement (tracking: Partially - No metrics collected)
- Tasting participation (tracking: Not implemented - No tasting flow)
- Collection sizes (tracking: Not implemented - Database queries not set up)
- Retainment rates (tracking: Not implemented - No user behavior tracking)

## 8. MoSCoW Prioritization

### Must-Have (Completed or Critically Needed)
- Basic authentication ✅
- Bottle search and display ✅
- Provisional bottle addition ✅
- Elo ranking display ✅
- Mobile-responsive layout ✅

### Should-Have (Important but Can Wait)
- My Bar collection (In development - placeholder exists)
- Blind tasting flow (Planned - core feature)
- Advanced search filters (Partially implemented)
- Social features (Not started)

### Could-Have (Nice to Have)
- Offline mode (Pending)
- Advanced analytics (Not started)
- Brewery partnerships (Not started)

### Won't-Have (Not for MVP)
- Push notifications
- Social networking features beyond ratings

## 9. Aesthetic Philosophy

**Status: Partially Defined - Basic Tailwind implementation**
- Clean, whiskey-inspired color scheme
- Card-based layout for bottles
- Consistent typography with Geist font
- Icon usage with Lucide React
- Gray and brown color palette for sophistication

## 10. Deployment Plan

### Phase 1: Development Environment Setup
- [x] Install Node.js v20 -> Completed: Engine specified >=18.17.0, development ongoing
- [x] Configure project dependencies -> Completed: package.json with all deps
- [x] Set up local development server -> Completed: npm run dev script working
- [x] Initialize Next.js project structure -> Completed: App router configured

### Phase 2: Backend Infrastructure
- [x] Set up Supabase project -> Completed: Database tables and auth configured
- [x] Implement database schema -> Completed: Users, bottles, bottle_attr tables
- [x] Configure authentication -> Completed: Email/password auth working
- [x] Implement Elo ranking system -> Completed: Global rankings calculated

### Phase 3: Core Features Development
- [x] Build authentication flow -> Completed: Login/signup pages
- [x] Create search functionality -> Completed: Advanced search with results
- [x] Implement bottle display -> Completed: BottleCard with rankings
- [x] Add provisional bottle system -> Completed: Add bottle sheet

### Phase 4: Mobile Optimization & UX
- [x] Ensure mobile responsiveness -> Completed: Tailwind responsive design
- [x] Implement thumb-friendly navigation -> Completed: Bottom nav bar
- [x] Add loading states and skeletons -> Completed: Progressive loading UX
- [x] Test on various mobile devices -> Pending: Not comprehensively tested

### Phase 5: Deployment & Launch
- [x] Configure Vercel deployment -> Completed: vercel.json with build settings
- [x] Set up production database -> Completed: Supabase configured
- [x] Implement error monitoring -> Partially: Basic error logging
- [x] Set up domain and SSL -> Pending: Assuming Vercel handles SSL, domain not set
- [x] Optimize build performance -> Completed: Next.js optimization enabled

### Phase 6: Monitoring & Analytics
- [ ] Create user analytics tracking -> Pending: No analytics implemented
- [ ] Set up performance monitoring -> Pending: No monitoring tools
- [ ] Implement error reporting -> Completed: Basic error handling
- [ ] Configure logging systems -> Partially: Console logging in place

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Supabase project and configure environment variables
4. Run development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Supabase service role key for server-side operations
