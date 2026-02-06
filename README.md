# Nolt Admin Backend

The backend service for the Nolt Finance Loan Management System. This Application handles loan processing, user management, staff invitations, and integrations with third-party services (Termii, Supabase).

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (via Supabase)
- **ORM/Query Builder**: `postgres.js` (raw SQL queries with safe interpolation)
- **Authentication**: Passport.js (Local & Google OAuth), Session-based
- **Documentation**: Swagger UI
- **Notifications**: Termii (Email/OTP)

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (v9 or higher)
- PostgreSQL database (or Supabase project)

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Nolt-Admin-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory patterned after the example below.

**Required Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Secret key for session signing | `your_complex_secret` |
| `CLIENT_ID` | Google OAuth Client ID | `...apps.googleusercontent.com` |
| `CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-...` |
| `FRONTEND_URL` | URL of the frontend app | `http://localhost:5173` |

**Supabase Integration:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Anon public key |
| `SUPABASE_SERVICE_KEY` | Service role key (for admin tasks) |

**Termii Configuration (Email/OTP):**

| Variable | Description |
|----------|-------------|
| `TERMII_BASE_URL` | Termii API Base URL |
| `TERMII_API_KEY` | Your Termii API Key |
| `TERMII_EMAIL_CONFIG_ID` | Email Configuration ID from Termii Dashboard |

### 4. Database Migration

The project uses SQL migration files located in `migrations/`.

```bash
# Example: Run the loans table creation migration
npx tsx migrations/create_loans_table.ts
```

### 5. Running the Application

**Development Mode:**
Runs with `node --watch` and `tsx` for auto-reloading.

```bash
npm run dev
```

**Production Build:**

```bash
npm run build
npm start
```

The server will start on `http://localhost:5000` (or your specified PORT).

## API Documentation

Interactive API documentation is available via Swagger UI.

1. Start the server.
2. Visit **[http://localhost:5000/api-docs](http://localhost:5000/api-docs)** in your browser.

## Key Features

- **Staff Management**: Invite staff, revoke access, assign roles (Super Admin, Sales Officer, etc.).
- **Loan Processing**: State machine implementation for loan stages (Credit Check -> Audit -> Finance).
- **Document Management**: Upload and retrieval of loan documents.
- **Role-Based Access Control (RBAC)**: Middleware ensures endpoints are restricted to appropriate roles.
