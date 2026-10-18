'use client';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect, type ReactNode} from 'react';
import {RoutePlanner} from '@/features/routing/client/RoutePlanner';

// The layout owns these clients, so a tab or step changes visibility, not identity.
export function PublicApp({children}:{children:ReactNode}) {
  const pathname=usePathname(),router=useRouter();
  useEffect(()=>{window.scrollTo(0,0);document.getElementById('public-main')?.focus({preventScroll:true})},[pathname]);
  const integrated=pathname==='/route'||pathname.startsWith('/route/')||pathname==='/report'||pathname.startsWith('/report/')||pathname==='/my-reports'||pathname.startsWith('/my-reports/');
  return integrated?<RoutePlanner pathname={pathname} onNavigate={path=>router.push(path,{scroll:true})}>{children}</RoutePlanner>:children;
}
