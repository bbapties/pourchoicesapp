# Pour Choices Backend API

Backend API server for the Pour Choices MVP application.

## Features

- **Authentication**: JWT-based user authentication with signup/login
- **Spirits Management**: CRUD operations for bottles/spirits with full-text search
- **Collections**: User bottle collections with volume tracking
- **Tastings**: Blind tasting sessions with Elo-based rankings
- **Analytics**: User interaction tracking for UX optimization
- **AI Integration**: Photo recognition for bottle identification (planned)

## Tech Stack

- **Node.js** with Express.js
- **PostgreSQL** database with full-text search
- **JWT** for authentication
- **Joi** for request validation
- **Helmet** for security
- **Rate limiting** for API protection

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Database setup**:
   - Install PostgreSQL
   - Create database: `createdb pour_choices`
   - Run schema: `psql -d pour_choices -f database/schema.sql`

3. **Environment configuration**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token

### Spirits
- `GET /api/spirits/search?query=...` - Search bottles
- `GET /api/spirits/:id` - Get bottle details
- `POST /api/spirits` - Add new bottle
- `GET /api/spirits/filter` - Filter bottles with rankings

### Collections
- `GET /api/collections` - Get user's collection
- `POST /api/collections` - Add bottle to collection
- `PUT /api/collections/:id` - Update collection item
- `DELETE /api/collections/:id` - Remove from collection

### Tastings
- `POST /api/tastings` - Start new tasting
- `PUT /api/tastings/:id/assign` - Assign bottles to slots
- `PUT /api/tastings/:id/notes` - Save tasting notes
- `PUT /api/tastings/:id/ranks` - Save rankings
- `GET /api/tastings/:id/reveal` - Get reveal data

### Analytics
- `POST /api/analytics/events` - Log user events

## Database Schema

The database includes tables for:
- **users**: User profiles and preferences
- **spirits**: Bottle/spirit information
- **user_collections**: Personal bottle collections
- **tastings**: Blind tasting sessions
- **bottle_ratings**: Elo-based rankings
- **analytics_events**: User interaction tracking

## Development

- **Linting**: ESLint configuration included
- **Testing**: Jest test framework setup
- **Hot reload**: Nodemon for development
- **Error handling**: Comprehensive error middleware

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure production database
3. Set secure JWT secret
4. Enable SSL/HTTPS
5. Configure reverse proxy (nginx)
6. Set up monitoring and logging

## Security Features

- Helmet.js for security headers
- Rate limiting to prevent abuse
- Input validation with Joi
- SQL injection prevention with parameterized queries
- CORS configuration
- JWT token expiration

## Performance

- Connection pooling for database
- Compression middleware
- Full-text search indexing
- Pagination for large datasets
- Efficient query optimization
