'use client';

import { motion } from 'framer-motion';
import { Award,Bell, Star, UserPlus, Users } from 'lucide-react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';


// Animation variants
const sectionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const textVariants = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.4 } },
};

const listItemVariants = {
  hidden: { x: -10, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.3 } },
};

const imageVariants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.5, delay: 0.2 } },
};

export function LandingCommunitySharing() {
  const { t } = useTranslation('landing');

  // Social platform features
  const socialFeatures = [
    { key: 'community.socialFeatures.profiles', icon: Users },
    { key: 'community.socialFeatures.following', icon: UserPlus },
    { key: 'community.socialFeatures.notifications', icon: Bell },
    { key: 'community.socialFeatures.reputation', icon: Award },
  ];

  // Community stats
  const stats = [
    { key: 'community.stats.developers' },
    { key: 'community.stats.servers' },
    { key: 'community.stats.collections' },
    { key: 'community.stats.languages' },
  ];

  return (
    <motion.section
      id="community"
      className="py-16 md:py-24 lg:py-32 overflow-hidden"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
    >
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Text Content */}
          <motion.div variants={textVariants}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
              {t('community.title')}
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {t('community.subtitle')}
            </p>
            <p className="text-base text-muted-foreground mb-8">
              {t('community.description')}
            </p>

            {/* Community Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {stats.map((stat) => (
                <Card key={stat.key} className="border-muted">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">{t(stat.key)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Social Features */}
            <h3 className="text-xl font-semibold mb-4">
              {t('community.socialFeatures.title')}
            </h3>
            <motion.ul className="space-y-3" variants={listVariants}>
              {socialFeatures.map((feature) => (
                <motion.li key={feature.key} className="flex items-start" variants={listItemVariants}>
                  <feature.icon className="h-5 w-5 text-primary mr-3 mt-1 flex-shrink-0" />
                  <span className="text-muted-foreground">{t(feature.key)}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Visual Content */}
          <motion.div variants={imageVariants} className="relative aspect-video rounded-lg overflow-hidden shadow-xl border border-border/40 bg-muted">
             {/* Placeholder for visual representation */}
             {/* Replace with an actual Image component or interactive demo */}
             <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-muted-foreground italic">
                  {t('community.visualPlaceholder')}
                </p>
                {/* Example: Mockup of ratings */}
                <div className="absolute bottom-4 left-4 bg-background/80 p-2 rounded shadow flex items-center text-xs">
                    <Star className="h-3 w-3 text-yellow-400 mr-1"/> 4.8 (12 Reviews)
                </div>
             </div>
             {/* <Image src={placeholderImageUrl} alt="Community Sharing Visual" layout="fill" objectFit="cover" /> */}
             <Image src="/screenshot.png" alt="Community Sharing Visual" layout="fill" objectFit="cover" />
             {/* TODO: Consider Animated-beam here later */}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
