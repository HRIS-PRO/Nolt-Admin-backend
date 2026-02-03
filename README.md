# Nolt Admin Backend

This is the backend for the Nolt Admin application, built with Express, TypeScript, and Passport.js for Google OAuth authentication.

## Features

- **Google OAuth**: Secure login/signup via Google.
- **Session Authentication**: Cookie-based sessions using `express-session`.
- **Automatic User Creation**: Automatically creates a customer account if one doesn't exist upon login ("Find or Create").
- **New Comer Tracking**: Tracks if a user is new via the `new_comer` flag.
- **PostgreSQL Database**: Uses `postgres` (porsager) client for database interactions.

## Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL Database

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory:
    ```env
    PORT=5000
    DATABASE_URL=postgres://user:password@host:port/database
    SESSION_SECRET=your_secret_key
    CLIENT_ID=your_google_client_id
    CLIENT_SECRET=your_google_client_secret
    NODE_ENV=development
    ```

3.  **Database Migration**:
    Run the migration scripts to set up the database tables:
    ```bash
    # Create customers table
    node --env-file=.env --import tsx migrations/create_customers_table.ts
    
    # Add new_comer column (if updating existing DB)
    node --env-file=.env --import tsx migrations/add_new_comer_column.ts
    ```

## Running the Server

Start the development server:
```bash
npm run dev
```
The server will start at `http://localhost:5000`.

## API Endpoints

### Authentication (`/auth`)

-   **`GET /auth/google`**
    -   **Description**: Initiates the Google OAuth flow.
    -   **Action**: Redirects the user to Google's sign-in page.

-   **`GET /auth/google/callback`**
    -   **Description**: The callback URL that Google redirects to after successful login.
    -   **Action**: 
        -   Verifies the user.
        -   Creates a session cookie.
        -   Redirects to the frontend dashboard: `http://localhost:3000/dashboard?login=success`.

-   **`GET /auth/logout`**
    -   **Description**: Logs the user out.
    -   **Action**: Destroys the session and redirects to the frontend home: `http://localhost:3000`.

### Customers (`/api`)

-   **`GET /api/me`**
    -   **Description**: Get current user's profile.
    -   **Auth Required**: Yes (Session Cookie).
    -   **Returns**: JSON object of the logged-in customer.
    -   **Response**:
        ```json
        {
          "id": 1,
          "google_id": "12345...",
          "email": "user@example.com",
          "full_name": "John Doe",
          "avatar_url": "...",
          "new_comer": true
        }
        ```

## Project Structure

-   **`config/`**: Configuration files (Passport strategy, Database connection).
-   **`routes/`**: API Route handlers (`auth.ts`, `customer.ts`).
-   **`migrations/`**: Database migration scripts.
-   **`index.ts`**: Main application entry point.

## License

ISC
