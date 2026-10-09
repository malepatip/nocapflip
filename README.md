<<<<<<< HEAD
# No Cap — nocapflip.com

The game is plain static files, no build step:
- `index.html`: page, styles and markup
- `js/farts.js`: the recorded sounds · `js/physics.js`: bottle physics · `js/data.js`: kids, skins, audio · `js/render.js`: drawing, the school settings, recording · `js/match.js`: game flow · `js/net.js`: play by link and tapes
- `firebase-config.js`: your Firebase web config · `firestore.rules`: the database rules

Deploying from GitHub: connect this repo to a Cloudflare Pages project (no build command, output directory `/`). Every push to `main` goes live in about a minute.

## 1. Domain
nocapflip.com is registered at Cloudflare, so DNS and hosting live in the same dashboard.

## 2. Hosting (free): Cloudflare Pages, direct upload
1. Cloudflare dashboard → Workers & Pages → Create → Pages → "Upload assets".
2. Project name `nocapflip` → drag this folder in (`index.html` and `firebase-config.js`) → Deploy site.
3. Open the project → Custom domains → Set up a custom domain → `nocapflip.com` → Activate. Cloudflare adds the DNS record and the certificate itself; it is live within a few minutes.
4. Add `www.nocapflip.com` the same way if you want it to redirect.
To update the game later, upload the new `index.html` to the same project (Create new deployment).
If you would rather deploy from GitHub, connect the repo instead of uploading; the steps are otherwise the same.

Without a database the game already runs: solo ladder, pass the phone, video recording with a Save button.

## 3. Play by link + the tapes shelf (free tier)
1. console.firebase.google.com → Add project → name it → skip Analytics.
2. Build → Firestore Database → Create database → production mode → pick a region near you.
3. Rules tab → paste the contents of `firestore.rules` → Publish.
4. Project settings (gear) → Your apps → Web (</>) → register the app → copy the `firebaseConfig` object.
5. Open `firebase-config.js` and replace `null` with the object (so it reads `window.FIREBASE_CONFIG = { apiKey: ..., projectId: ... };`).
6. Redeploy the whole folder (index.html and firebase-config.js). Tables, codes, links and tapes now work for anyone with the URL; no sign-in needed.
Firestore's free tier (1 GiB, 50k reads and 20k writes a day) covers a hobby channel comfortably; a game is roughly 30 writes.
The rules let anyone write small, well-formed documents. That is fine for a toy; if it ever gets abused, add Firebase App Check or anonymous auth.

## 4. The videos
The game records the stage (1080×1920, with sound) on each phone and offers the file with a normal download; no server involved.
On iPhone the download lands in Files; on Android in Downloads. Upload straight to YouTube Shorts.

## Notes
- Physics: Matter.js from cdnjs. Fonts: Google Fonts. Fart recordings: fartscroll.js by The Onion (MIT).
- The share link is whatever URL the page is served from, plus `#CODE`.
=======
# nocapflip
# nocapflip
Repo the makes games
>>>>>>> 360fda4adbd36f938f1af2b94198dc758cfcb283
