# FlexiPMT

Aplicație web pentru gestionarea, prelucrarea și raportarea încercărilor de presiometrie OYO (referință SR EN ISO 22476-5:2023).

Organizare: **Proiect → Foraj → Test**, calcule în modul separat, PostgreSQL, UI în română (raport RO/EN).

Repo: [github.com/ShubaHD/FlexiPMT](https://github.com/ShubaHD/FlexiPMT)

## Pornire locală

1. Copiază `.env.example` → `.env` și completează `DATABASE_URL` + `DIRECT_URL`.

**Opțiunea A — Postgres local (Docker):**

```powershell
docker compose up -d
```

În `.env`:

```
DATABASE_URL="postgresql://flexipmt:flexipmt@localhost:5432/flexipmt"
DIRECT_URL="postgresql://flexipmt:flexipmt@localhost:5432/flexipmt"
```

**Opțiunea B — Supabase:** folosește connection strings din Dashboard → Project Settings → Database (vezi mai jos).

```powershell
npm install
npx prisma migrate deploy
npm run db:seed-demo
npm run dev
```

Deschide [http://localhost:3002](http://localhost:3002).

## Deploy online (Vercel + Supabase)

### 1. Supabase

1. Creează un proiect pe [supabase.com](https://supabase.com)
2. **Project Settings → Database → Connection string**
   - **Transaction** (pooler, port `6543`) → `DATABASE_URL`  
     Adaugă la final: `?pgbouncer=true`
   - **Session** sau **Direct** (port `5432`) → `DIRECT_URL`
3. (Opțional) rulează migrările din local o dată:
   ```powershell
   npx prisma migrate deploy
   ```
   (Vercel le rulează și la `npm run build`.)

### 2. Vercel

1. Intră pe [vercel.com](https://vercel.com) → **Add New Project** → importă `ShubaHD/FlexiPMT`
2. Environment Variables:
   - `DATABASE_URL` = pooler Supabase (`…:6543/postgres?pgbouncer=true`)
   - `DIRECT_URL` = conexiune directă / session (`…:5432/postgres`)
3. Deploy. URL-ul va fi de forma `https://flexipmt-….vercel.app`

### 3. După primul deploy

- Deschide aplicația → **Setări** (firmă, logo, Întocmit/Verificat)
- Sau rulează seed local împotriva bazei Supabase: `npm run db:seed-demo`

## Flux tipic (Elast Logger)

1. **Proiecte** → proiect + foraj  
2. Pe foraj / test: **Import CSV** Elast  
3. Completează datele obligatorii (ν, L celulă, limită aparat, interval fit, ps)  
4. Grafic → selecții pe program  
5. **Raport** → limba RO/EN → Tipărește/PDF  

## Teste

```powershell
npm test
```

## Structură

- `src/lib/calc` — formule ISO (5)/(6)/(7), programe A/B/C/D
- `src/lib/import` — Elast CSV + JSON migrat
- `src/lib/schema` — schema internă v1
- `src/lib/report` — conținut raport + i18n RO/EN
- `prisma` — PostgreSQL (Proiect / Foraj / PmtTest / LabSettings)
- `fixtures/reference/` — CSV de regresie

## Note importante

- **pMax ≠ rupere / pL**: maximul e pMax; ruperea se consemnează explicit.
- Programe A/B/C/D: rezultate distincte; fără atribuire automată fără confirmare.
- Pentru CSV Elast (dRi), baza implicită este Formula (5).
- Nu comiteți `.env` (parole Supabase).
