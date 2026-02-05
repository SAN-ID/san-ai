
import { GoogleGenAI, Modality } from "@google/genai";

const SYSTEM_INSTRUCTIONS = {
  chat: `Nama Anda adalah San AI. Anda adalah asisten AI yang cerdas, cepat, dan membantu.
  - Berikan jawaban yang jelas, singkat, dan padat.
  - Gunakan Bahasa Indonesia yang natural.
  - Selalu letakkan kode pemrograman, perintah terminal, atau teks teknis penting di dalam blok kode (markdown backticks).
  - Jangan terlalu banyak basa-basi, langsung ke poin utamanya.`,
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAIResponse = async (
  prompt: string, 
  imageUri?: string
) => {
  const parts: any[] = [{ text: prompt }];

  if (imageUri) {
    const base64Data = imageUri.split(',')[1];
    const mimeType = imageUri.split(';')[0].split(':')[1];
    parts.push({
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS.chat,
        temperature: 0.7,
      },
    });

    return response.text || "Maaf, terjadi kesalahan koneksi.";
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
};

export const generateTTS = async (text: string) => {
  try {
    // Bersihkan teks dari markdown agar suara lebih bersih
    const cleanText = text.replace(/```[\s\S]*?```/g, '[Kode]')
                          .replace(/\*\*/g, '')
                          .replace(/\[.*?\]\(.*?\)/g, '')
                          .substring(0, 800);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};
