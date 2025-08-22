# GitHub Copilot Tactics Analysis - React Frontend

A React frontend to visualize the thematic analysis of GitHub Copilot tactics and methods for improving software development efficiency.

## Setup Instructions

### 1. Install Backend Dependencies
```bash
npm install
```

### 2. Install Frontend Dependencies
```bash
npm run install-frontend
```

### 3. Run the Application

#### Option A: Run both backend and frontend together
```bash
npm run dev
```

#### Option B: Run separately
```bash
# Terminal 1 - Backend API
npm run api

# Terminal 2 - Frontend
npm run frontend
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

## API Endpoints

- `GET /api/thematic-analysis` - Get complete thematic analysis data
- `GET /api/papers/:referenceNumber` - Get specific paper details
- `GET /api/health` - Health check

## Data Structure

The application displays data in the format you requested:

```
Theme
  Sub-theme
    Codes: "tactic1", "tactic2", "tactic3"
    References: [1], [2], [3], [4]
```

### Example:
```
AI Tools
  Productivity and efficiency
    Codes: "GitHub Copilot", "code generation", "developer productivity"
    References: [1], [3], [9], [11], [13]
  Code quality and security
    Codes: "security weaknesses", "code vulnerabilities", "testing"
    References: [5], [12], [14], [26]
```

## Features

- **Collapsible Themes**: Click on theme headers to expand/collapse
- **Search Functionality**: Search across themes, sub-themes, and tactics
- **Summary Statistics**: Overview of papers, themes, sub-themes, and tactics
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Data**: Connects to your PostgreSQL database

## Database Requirements

Ensure your PostgreSQL database is running and contains:
- `research_results` table with papers and reference numbers
- `themes` and `subthemes` tables with hierarchical relationships
- `codes` table with tactics/methods
- Relationship tables linking everything together

The frontend automatically fetches data from your existing database structure.
