import express from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

app.use(express.json());

const PORT = 3000;

app.post("/identify", async (req, res) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber required" });
  }

  const result = await prisma.$transaction(async (tx) => {
    //  Find matching contacts
    const matchedContacts = await tx.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: { createdAt: "asc" },
    });

    // CASE : No match → create primary
    if (matchedContacts.length === 0) {
      const newContact = await tx.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkPrecedence: "primary",
        },
      });

      return {
        primaryContactId: newContact.id,
        emails: newContact.email ? [newContact.email] : [],
        phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
        secondaryContactIds: [],
      };
    }

    //  Get all related contacts
    const contactIds = matchedContacts.map((c) =>
      c.linkPrecedence === "primary" ? c.id : c.linkedId!,
    );

    const allRelatedContacts = await tx.contact.findMany({
      where: {
        OR: [{ id: { in: contactIds } }, { linkedId: { in: contactIds } }],
      },
      orderBy: { createdAt: "asc" },
    });

    //  Determine oldest primary
    const primaries = allRelatedContacts.filter(
      (c) => c.linkPrecedence === "primary",
    );

    primaries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const oldestPrimary = primaries[0];

    //  Convert other primaries to secondary
    for (const contact of primaries.slice(1)) {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          linkPrecedence: "secondary",
          linkedId: oldestPrimary.id,
        },
      });
    }

    //  Refresh related contacts
    const refreshedContacts = await tx.contact.findMany({
      where: {
        OR: [{ id: oldestPrimary.id }, { linkedId: oldestPrimary.id }],
      },
    });

    const emailExists = refreshedContacts.some((c) => c.email === email);
    const phoneExists = refreshedContacts.some(
      (c) => c.phoneNumber === phoneNumber,
    );

    if (!emailExists || !phoneExists) {
      await tx.contact.create({
        data: {
          email: email || null,
          phoneNumber: phoneNumber || null,
          linkedId: oldestPrimary.id,
          linkPrecedence: "secondary",
        },
      });
    }

    //  Final fetch
    const finalContacts = await tx.contact.findMany({
      where: {
        OR: [{ id: oldestPrimary.id }, { linkedId: oldestPrimary.id }],
      },
      orderBy: { createdAt: "asc" },
    });

    const emails = [
      ...new Set(
        finalContacts
          .map((c) => c.email)
          .filter((e): e is string => Boolean(e)),
      ),
    ];

    const phoneNumbers = [
      ...new Set(
        finalContacts
          .map((c) => c.phoneNumber)
          .filter((p): p is string => Boolean(p)),
      ),
    ];

    const secondaryContactIds = finalContacts
      .filter((c) => c.linkPrecedence === "secondary")
      .map((c) => c.id);

    return {
      primaryContactId: oldestPrimary.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    };
  });

  return res.status(200).json({ contact: result });
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
