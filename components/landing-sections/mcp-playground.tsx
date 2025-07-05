'use client';

import { motion } from 'framer-motion';
import { 
  Activity, 
  Cpu, 
  Database, 
  FileCode, 
  Gauge} from 'lucide-react';
import Image from 'next/image';
import { Trans, useTranslation } from 'react-i18next';

// TODO: Integrate MagicUI components when available:
// - Terminal component
// - Script-copy-btn for code snippets

// Animation variants (can reuse or define new ones)
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const textVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

const terminalVariants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.5, delay: 0.4 } },
};

export function LandingMcpPlayground() {
  // Explicitly use the 'landing' namespace
  const { t } = useTranslation('landing');


  return (
    <motion.section
      id="playground"
      className="py-16 md:py-24 lg:py-32 bg-muted/30"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        {/* Langchain Abstraction Callout */}
        <div className="mb-8 flex items-center justify-center">
          <div className="rounded-lg bg-primary/10 text-primary px-4 py-3 text-center max-w-xl w-full border border-primary/20 shadow-sm">
            <Trans i18nKey="playground.langchainCallout" ns="landing">
              <strong>Test with Any Model:</strong> Thanks to our <span className="font-semibold">Langchain abstraction</span>, you can test your MCP servers with Claude, GPT, Llama, and more—all from a single playground. Instantly compare models and experience true model-agnostic AI.
            </Trans>
          </div>
        </div>

        <motion.div className="mb-12 text-center max-w-2xl mx-auto" variants={textVariants}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('playground.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('playground.subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Features Grid */}
          <motion.div variants={textVariants}>
             <div className="grid grid-cols-1 gap-6">
               {/* Multi-Model Support */}
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('playground.feature1Title')}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                          {t('playground.feature1Desc')}
                      </p>
                  </div>
               </div>
               
               {/* RAG Integration */}
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <Database className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('playground.feature2Title')}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                          {t('playground.feature2Desc')}
                      </p>
                  </div>
               </div>
               
               {/* Performance */}
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <Gauge className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('playground.feature3Title')}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                          {t('playground.feature3Desc')}
                      </p>
                  </div>
               </div>
               
               {/* Custom Instructions */}
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <FileCode className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('playground.feature4Title')}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                          {t('playground.feature4Desc')}
                      </p>
                  </div>
               </div>
               
               {/* Real-time Monitoring */}
               <div className="flex items-start">
                  <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mr-4">
                      <Activity className="h-5 w-5" />
                  </div>
                  <div>
                      <h3 className="text-lg font-semibold">
                          {t('playground.feature5Title')}
                      </h3>
                      <p className="text-muted-foreground mt-1">
                          {t('playground.feature5Desc')}
                      </p>
                  </div>
               </div>
             </div>
          </motion.div>

           {/* Image Placeholder */}
           <motion.div variants={terminalVariants} className="flex items-center justify-center order-first lg:order-last">
             <div className="aspect-video w-full max-w-lg rounded-lg border border-border/40 relative overflow-hidden shadow-xl">
               <Image 
                 src="/screenshot3.png" 
                 alt="MCP Playground Interface"
                 fill
                 className="object-cover"
                 priority
               />
             </div>
           </motion.div>

        </div>
      </div>
    </motion.section>
  );
}
