# CineDB

Réplica académica de la API de [OMDb](https://www.omdbapi.com/) construida con Node.js y Supabase, con frontend estilo Netflix incluido.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js (ES Modules) |
| Servidor | Express 5 |
| Base de datos | Supabase (PostgreSQL) |
| Datos origen | OMDb API |
| Frontend | HTML + CSS + JS vanilla |

---

## Estructura del proyecto

```
peliculas_api/
├── public/
│   └── index.html          # Frontend (servido desde el mismo servidor)
├── server.js               # API REST
├── fetch_movies.js         # Seeder dinámico (búsqueda por términos, límite configurable)
├── fetch_top_movies.js     # Seeder con 60 títulos reconocidos fijos
├── schema.sql              # DDL para crear las tablas en Supabase
├── package.json
└── .env                    # Variables de entorno (no commitear)
```

---

## Configuración inicial

### 1. Variables de entorno

Crea o edita el archivo `.env` en la raíz:

```env
OMDB_API_KEY=tu_api_key
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...
```

### 2. Base de datos

Ejecuta `schema.sql` en el **SQL Editor de Supabase** para crear las tablas:

```sql
-- Tablas creadas:
-- movies   → información completa de cada película
-- ratings  → fuentes de rating vinculadas a cada película (IMDb, RT, Metacritic)
```

### 3. Instalar dependencias

```bash
npm install
```

---

## Poblar la base de datos

### Seeder dinámico (recomendado)

Descubre películas mediante búsqueda por términos rotados aleatoriamente. Límite configurable.

```bash
# 250 películas (por defecto)
npm run fetch

# Cantidad personalizada
node fetch_movies.js --limit=100
node fetch_movies.js --limit=500
```

### Seeder de títulos reconocidos

Obtiene exactamente 60 títulos icónicos por IMDb ID fijo (Shawshank, Godfather, Dark Knight, etc.).

```bash
npm run fetch:top
```

> **Límite OMDb:** 1 000 requests/día en el plan gratuito. Un fetch de 250 películas consume ~280 requests.

---

## Ejecutar el servidor

```bash
# Producción
npm start

# Desarrollo (reinicio automático al guardar)
npm run dev
```

El servidor levanta en **http://localhost:8089**.

---

## Frontend

Abre **http://localhost:8089** en el navegador.

- Buscador con debounce y botón para limpiar
- Grid de pósters estilo Netflix con animaciones al hover
- Paginación con elipsis para rangos largos
- Modal de detalle con plot, reparto, ratings y taquilla
- Espacio reservado en el navbar para login (próximamente)

---

## API Reference

Base URL: `http://localhost:8089/api`

Todos los endpoints devuelven JSON por defecto. El formato de respuesta es compatible con OMDb.

---

### GET /api — Por ID o título

Devuelve la información completa de una película. Se requiere al menos uno de los parámetros `i` o `t`.

| Parámetro | Requerido | Opciones | Por defecto | Descripción |
|---|---|---|---|---|
| `i` | Opcional* | | | IMDb ID (ej. `tt1285016`) |
| `t` | Opcional* | | | Título exacto (case-insensitive) |
| `type` | No | `movie`, `series`, `episode` | | Filtra por tipo |
| `y` | No | | | Año de estreno |
| `plot` | No | `short`, `full` | `short` | Longitud del plot (aceptado, misma respuesta) |
| `r` | No | `json`, `xml` | `json` | Formato de respuesta |
| `callback` | No | | | Nombre de función JSONP |

> \* Al menos uno de `i` o `t` es obligatorio.

**Ejemplo — por ID:**
```
GET /api?i=tt0111161
```

**Ejemplo — por título:**
```
GET /api?t=Inception
GET /api?t=The%20Matrix&y=1999
```

**Respuesta exitosa:**
```json
{
  "Title": "The Shawshank Redemption",
  "Year": "1994",
  "Rated": "R",
  "Released": "14 Oct 1994",
  "Runtime": "142 min",
  "Genre": "Drama",
  "Director": "Frank Darabont",
  "Writer": "Stephen King, Frank Darabont",
  "Actors": "Tim Robbins, Morgan Freeman, Bob Gunton",
  "Plot": "A wrongfully convicted banker...",
  "Language": "English",
  "Country": "United States",
  "Awards": "Nominated for 7 Oscars. 21 wins & 42 nominations total",
  "Poster": "https://m.media-amazon.com/...",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "9.3/10" },
    { "Source": "Rotten Tomatoes",         "Value": "89%"    },
    { "Source": "Metacritic",              "Value": "82/100" }
  ],
  "Metascore": "82",
  "imdbRating": "9.3",
  "imdbVotes": "3,179,655",
  "imdbID": "tt0111161",
  "Type": "movie",
  "DVD": "N/A",
  "BoxOffice": "$28,767,189",
  "Production": "N/A",
  "Website": "N/A",
  "Response": "True"
}
```

**Respuesta de error:**
```json
{ "Response": "False", "Error": "Movie not found!" }
```

---

### GET /api — Por búsqueda

Busca películas por fragmento de título. Devuelve 10 resultados por página.

| Parámetro | Requerido | Opciones | Por defecto | Descripción |
|---|---|---|---|---|
| `s` | Sí | | | Fragmento del título a buscar |
| `type` | No | `movie`, `series`, `episode` | | Filtra por tipo |
| `y` | No | | | Año de estreno |
| `r` | No | `json`, `xml` | `json` | Formato de respuesta |
| `page` | No | `1`–`100` | `1` | Número de página |
| `callback` | No | | | Nombre de función JSONP |

**Ejemplo:**
```
GET /api?s=batman
GET /api?s=star&type=movie&y=1977&page=1
```

**Respuesta exitosa:**
```json
{
  "Search": [
    {
      "Title": "The Dark Knight",
      "Year": "2008",
      "imdbID": "tt0468569",
      "Type": "movie",
      "Poster": "https://m.media-amazon.com/..."
    }
  ],
  "totalResults": "4",
  "Response": "True"
}
```

**Respuesta de error:**
```json
{ "Response": "False", "Error": "Movie not found!" }
```

---

### Formatos alternativos

**XML** — agrega `&r=xml` a cualquier endpoint:
```
GET /api?i=tt0111161&r=xml
GET /api?s=batman&r=xml
```

**JSONP** — agrega `&callback=nombreFuncion`:
```
GET /api?s=batman&callback=miFuncion
```

---

## Esquema de base de datos

### Tabla `movies`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial PK | |
| `imdb_id` | varchar(20) unique | ej. `tt0111161` |
| `title` | text | |
| `year` | varchar(10) | ej. `1994` |
| `rated` | varchar(20) | ej. `R`, `PG-13` |
| `released` | date | |
| `runtime_min` | integer | duración en minutos |
| `genre` | text[] | array de géneros |
| `director` | text | |
| `writer` | text | |
| `actors` | text | |
| `plot` | text | |
| `language` | text | |
| `country` | text | |
| `awards` | text | |
| `poster` | text | URL |
| `metascore` | smallint | |
| `imdb_rating` | numeric(3,1) | |
| `imdb_votes` | integer | |
| `type` | varchar(20) | `movie`, `series`, `episode` |
| `box_office` | bigint | en USD |
| `created_at` | timestamptz | |

### Tabla `ratings`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial PK | |
| `movie_id` | integer FK → movies.id | |
| `source` | varchar(100) | ej. `Rotten Tomatoes` |
| `value` | varchar(50) | ej. `89%` |
