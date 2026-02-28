# Bitespeed Backend Task — Identity Reconciliation

## Overview

This service implements an identity reconciliation system for FluxKart.com.

The goal is to consolidate customer contact information across multiple purchases, even when different email addresses or phone numbers are used.

The system ensures:

- A customer can have multiple contact records
- The oldest contact is treated as **primary**
- All others are treated as **secondary**
- Contacts are linked if they share either email or phoneNumber
- Primary contacts can turn into secondary if merging is required
- All operations are atomic using database transactions

---

## Tech Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma ORM

---

## Database Schema

### Contact Table

| Field          | Type                     | Description               |
| -------------- | ------------------------ | ------------------------- |
| id             | Int                      | Primary key               |
| phoneNumber    | String?                  | Optional phone number     |
| email          | String?                  | Optional email            |
| linkedId       | Int?                     | Points to primary contact |
| linkPrecedence | "primary" \| "secondary" | Defines role              |
| createdAt      | DateTime                 | Record creation time      |
| updatedAt      | DateTime                 | Auto-updated              |
| deletedAt      | DateTime?                | Soft delete               |

---

## API Endpoint

### POST `/identify`

### Request Body (JSON)

```json
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
```
