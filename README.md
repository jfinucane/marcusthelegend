Build a full-stack worldbuilding and storytelling web application using React (frontend),
Flask (backend API), and PostgreSQL (database). Use Gemini Flash for AI image generation
via the Google Generative AI Python SDK (`google-generativeai`). Images should be stored
locally on the server (e.g., in a `static/images/` directory) and served via Flask.

## STYLING

Use Tailwind CSS for all frontend styling. Configure it properly:
- Install via `npm install -D tailwindcss postcss autoprefixer` and run `npx tailwindcss init -p`
- Set `content` in `tailwind.config.js` to cover `./src/**/*.{js,jsx}`
- Import Tailwind directives in `index.css`: @tailwind base; @tailwind components; @tailwind utilities;
- Use a dark theme throughout — dark backgrounds (gray-900/gray-800), light text,
  accent colors for interactive elements (e.g., indigo or violet)
- Do NOT use any other CSS framework or component library
