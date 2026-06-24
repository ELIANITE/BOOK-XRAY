# BOOK XRAY

A full-stack prototype for uploading books and reading them in a Kindle-style reader with per-page payment and M-Pesa support.

## Features

- Author book upload
- Per-page pricing
- M-Pesa payment checkout
- Simple reader showing one page at a time

## Setup

### Requirements

- Install Node.js and npm before running the project.

### Backend

cd server
npm install
cp .env.example .env
# Fill in Daraja credentials in .env
../server/.local/node-v20.18.0-darwin-x64/bin/node index.js

### Frontend

cd client
npm install
../server/.local/node-v20.18.0-darwin-x64/bin/npm run dev

## Notes

- Uploads are stored under `server/uploads`.
- Text files are automatically paginated into pages.
- PDF and DOCX uploads are now supported, with original files available for download.
- Each book can optionally specify a destination: default paybill, an M-Pesa phone number, or a bank account tag.
- If a book does not specify a destination, payments use the default `MPESA_SHORTCODE` from `server/.env`.
- You can buy multiple pages starting from the selected page.
- `M-Pesa` payment status is tracked in memory for the prototype.

## GitHub Deployment

This project can be stored in a GitHub repository and the frontend can be published via GitHub Pages.

1. Initialize Git in the repository root:
   ```bash
   cd /Users/gem/SOFTWARE
   git init
   git add .
   git commit -m "Initial BOOK XRAY commit"
   ```
2. Create a GitHub repository and add it as a remote:
   ```bash
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
3. The repository includes a GitHub Actions workflow that builds the frontend and deploys `client/dist` to the `gh-pages` branch.
4. GitHub Pages will publish the frontend from the `gh-pages` branch once the workflow runs.

> Note: the backend is an Express app and cannot run on GitHub Pages. To use the full app, host the backend on a service like Railway, Render, or Heroku, or run it locally on `http://localhost:4000`.

This is a prototype implementation. Use real authentication, secure storage, and production-ready payment handling before deploying.
