# Fișiere de referință FlexiPMT

## Obligatorii pentru import / calcul (regresie)

| Fișier | Antet |
|--------|--------|
| `000ELAST.CSV` | Hole **60785**, Depth **19.0**, Data size **102**, A(1)=**811.465** |
| `001ELAST.CSV` | Hole **60785**, Depth **21.0**, Data size **105** |

Calculul folosește **doar** Pressure, dRi, R din aceste CSV (export Elast Logger).

## Opționale — documente aparat (fără efect pe calcul)

Fișiere KP/GA (ex. `C20261009_*_KP/GA.CSV`) pot fi păstrate aici ca referință pentru
aparatul OYO. **Nu** intră în calculele FlexiPMT și **nu** sunt cerute de testele de
regresie pentru import/calcul.

Elast Logger a aplicat deja calibrarea aparatului la generarea valorilor exportate.
