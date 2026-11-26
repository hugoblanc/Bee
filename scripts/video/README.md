# Vidéo de présentation

Régénère la vidéo verticale (1080×1920, format WhatsApp) à partir de l'appli.

```bash
npm run build && npm start                     # serveur local sur :8787
node scripts/video/demo.cjs                    # joue la démo (Chrome/Playwright), capture les plans
node scripts/video/compose.cjs                 # légende + cadre de téléphone pour chaque plan
cd scripts/video && ffmpeg -f concat -safe 0 -i concat.txt \
  -vf "fps=30,format=yuv420p" -c:v libx264 -crf 22 -movflags +faststart presentation.mp4
```

Le script de démo pilote la carte via le mode `?demo` de l'appli. Les textes des plans sont dans `demo.cjs`.
