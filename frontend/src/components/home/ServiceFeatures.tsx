// 서비스 소개 배너 — 이미지·텍스트 교차 배치(dutymate.net 참고) + 스크롤 등장 모션
'use client';

import Image from 'next/image';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { SERVICE_FEATURES } from '@/constants/homeCopy';

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1], delay: index * 0.12 },
  }),
};

export default function ServiceFeatures() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-20">
      {SERVICE_FEATURES.map((feature, index) => (
        <motion.div
          key={feature.title}
          className={`flex flex-col items-center gap-8 sm:gap-14 ${
            index % 2 === 1 ? 'sm:flex-row-reverse' : 'sm:flex-row'
          }`}
          variants={shouldReduceMotion ? undefined : rowVariants}
          custom={index}
          initial={shouldReduceMotion ? undefined : 'hidden'}
          whileInView={shouldReduceMotion ? undefined : 'visible'}
          viewport={{ once: true, amount: 0.4 }}
        >
          <div className="bg-decor-ivory relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-2xl sm:w-[480px]">
            <Image
              src={feature.image}
              alt={feature.alt}
              fill
              sizes="(min-width: 640px) 480px, 100vw"
              className={feature.imageFit === 'contain' ? 'object-contain p-5' : 'object-cover'}
            />
          </div>
          <div className="text-center sm:text-left">
            <span className="bg-primary-100 text-primary-700 inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium">
              {feature.eyebrow}
            </span>
            <h3 className="mt-4 text-[24px] leading-[1.3] font-semibold whitespace-pre-line text-neutral-900 sm:text-[28px]">
              {feature.title}
            </h3>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-[1.6] text-neutral-600 sm:mx-0">
              {feature.description}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
