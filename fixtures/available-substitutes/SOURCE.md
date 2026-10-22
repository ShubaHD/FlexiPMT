# Fixture-uri disponibile pe disc — NU sunt fișierele de referință FlexiPMT

Aceste fișiere au fost găsite local când fișierele atașate (Hole 60785 / C20260915) lipseau.
Folosite doar pentru smoke / smoke-parser, **nu** pentru acceptarea FlexiPMT.

| Fișier local | Sursă | Conținut (antet) |
|--------------|-------|------------------|
| `IP43A_000ELAST.CSV` | `Elast_Data…\IP43A\000ELAST.CSV` | Hole IP43A, Depth 15.5, Data size **105**, A(1)=810.488 |
| `BH01_002ELAST_as_001.CSV` | `Elast_Data…\BH01_\002ELAST.CSV` | File ID 002, Hole BH01_, Depth 11.0, Data size **105**, A(1)=798.411 |
| `C20260201_155023_KP.CSV` | `Elast_Data…\260201\` | Kp correct, Ø76, A(1)=798.411 |
| `C20260201_160209_GA.CSV` | `Elast_Data…\260201\` | Gain correct, Ø85, A(1)=798.411, G=-5.260 |

**Referința cerută** (lipsește din proiect): Hole **60785**, 000 Data size **102**, calibrări **C20260915_***.
Copiați acele fișiere în `fixtures/reference/`.
