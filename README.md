# Pour Choices MVP

**Tagline:** "Picture Your Next Sip"

A mobile-first web app for whiskey enthusiasts, casual collectors, and social drinkers to discover, taste, rank, and manage spirits.

## Features

### Core Workflows
1. **User Profile Creation** - Quick onboarding with customizable profile pictures
2. **Search Database** - Text/barcode search with bottle details and rankings
3. **Blind Tastings** - 2-5 bottle comparisons with Elo-based rankings
4. **Bottle Rankings** - Personal and global percentile rankings (0-100)
5. **My Bar Collection** - Personal inventory management with volume tracking
6. **AI Photo Recognition** - Add bottles via camera with label recognition

### Design System
- **Colors:** Deep charcoal (#2F2F2F), rich amber (#DAA520), metallic gold (#FFD700)
- **Typography:** Playfair Display (headers), Inter (body)
- **Mobile-first:** Optimized for 375x812px baseline, scales to larger screens
- **Accessibility:** WCAG AA compliance, ARIA labels, keyboard navigation

### Technical Stack
- **Frontend:** Vanilla HTML/CSS/JavaScript (mobile-first responsive)
- **Backend:** Node.js/Express (planned)
- **Database:** PostgreSQL (planned)
- **Hosting:** Supabase + GoDaddy (planned)
- **AI:** Google Vision API for photo recognition (planned)

## Getting Started

1. Open `index.html` in a modern web browser
2. The app works offline with localStorage for user data
3. Sample bottle data is included for testing

## Development Status

### ✅ Completed
- Project structure and design system
- User profile creation workflow
- Search database functionality
- My Bar collection management
- Global navigation and UI components
- Toast notifications and loading states
- Analytics event tracking
- PWA manifest

### 🚧 In Progress
- Blind tastings workflow
- AI photo recognition
- Backend API integration
- Database schema implementation

### 📋 Planned
- Advanced filtering and sorting
- Social features
- Admin dashboard
- Offline sync capabilities

## Analytics

The app tracks user interactions for UX optimization:
- Button taps and form submissions
- Search queries and results
- Navigation patterns
- Error states and edge cases

All analytics are anonymous and stored locally during development.

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

Private project - All rights reserved.
