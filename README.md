# Cloud Registration System

This is the cloud-connected replacement for the previous single-file offline app.

## Architecture

- **4 Android tablets:** open `sender.html`; each tablet has its own Supabase Auth account.
- **Main laptop:** opens `admin.html`.
- **Supabase:** holds the 26,715-person database and the central registrations.
- Tablets **cannot read the people database**. They can only call the `register_person` RPC and receive:
  - `registered`
  - `already`
  - `invalid`
- The admin account can read the database, reports, statistics, remaining list, and reset registrations.
- Each tablet has a local queue. If cellular data drops while the sender page is already open, unsent identifiers are kept locally and retried when the connection returns.

---

# Setup — do these steps in order

## 1. Create a Supabase project

Create a new project at Supabase.

Do **not** put the `service_role` key anywhere in this website.

You only need:
- Project URL
- public / anon key

## 2. Create the database structure

In Supabase:

**SQL Editor → New query**

Paste and run:

`supabase/schema.sql`

## 3. Import the 2026 database

Go to:

**Table Editor → people → Import data from CSV**

Upload:

`data/people_2026.csv`

The CSV contains 26,715 people.

After import, confirm that the `people` table shows 26,715 rows.

## 4. Create five login accounts

Go to:

**Authentication → Users**

Create:

- 1 admin account for the laptop
- Tablet 1 account
- Tablet 2 account
- Tablet 3 account
- Tablet 4 account

Use email + password for each.

The tablet accounts only need to be entered once because the browser session is saved.

## 5. Assign roles

Copy the UUID shown for each of the five users.

Open:

`supabase/profiles_template.sql`

Replace the five `PASTE_..._UUID_HERE` values.

Run the edited SQL in Supabase SQL Editor.

## 6. Add your Supabase URL and anon key

Open:

`public/config.js`

Replace:

```js
SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
```

with the Project URL and anon/public key from Supabase.

The anon key is designed to be used by browser apps. Security comes from the RLS rules in `schema.sql`.

**Never use the Supabase service-role key in these files.**

## 7. Test before deploying

The files should be served over HTTP rather than double-clicked as `file://`.

If Python 3 is installed:

```bash
cd public
python3 -m http.server 8080
```

Then on the laptop:

`http://localhost:8080/admin.html`

The tablets will need a deployed public URL for cellular use.

## 8. Deploy the `public` folder

Deploy everything inside `public/` to a normal HTTPS static host.

After deployment:

- Laptop: `https://YOUR-SITE/admin.html`
- Tablets: `https://YOUR-SITE/sender.html`

## 9. Prepare each Android tablet

On Tablet 1:
1. Open `sender.html`
2. Sign in using the Tablet 1 account
3. Send one test number
4. Add the page to the Android Home Screen

Repeat for Tablets 2–4 using their own accounts.

## 10. Test simultaneous registration

Use four different numbers.

Send one from each tablet.

The laptop should update within about one second.

Then try the **same number on two tablets**:
- first tablet should receive `تم الإرسال`
- second tablet should receive `مسجل من قبل`

The database has a UNIQUE constraint on the person number, so it cannot be registered twice even if requests arrive almost simultaneously.

---

# Important operational notes

## Reset

Only the admin account can reset registrations.

Reset uses two confirmation prompts in the admin UI.

The tablets have no reset control.

## Data exposure

Sender accounts cannot `SELECT` the `people` table because RLS blocks it.

The sender RPC returns status only and does not return name, school, office, ID number, etc.

## Loss of cellular connection

The sender page keeps a local queue in the tablet browser.

If the network drops after the page is open:
- the number is marked as waiting
- it remains on that tablet
- when the connection returns, the page retries automatically

Do not clear Chrome data during operations, because that would clear a tablet's unsent local queue.

## Admin synchronization

The admin page performs a lightweight check every 1 second for new registration rows.

A new tablet registration should therefore appear on the laptop very quickly without manually refreshing the page.

## Backup

Before the live session, export the `people` table once from Supabase.

During use, the `registrations` table is the central record of submitted people.
