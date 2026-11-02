import * as route0 from '../source/app/api/auth/login/route';
import * as route1 from '../source/app/api/auth/logout/route';
import * as route2 from '../source/app/api/auth/password/route';
import * as route3 from '../source/app/api/data/route';
import * as route4 from '../source/app/api/devices/route';
import * as route5 from '../source/app/api/documents/download/route';
import * as route6 from '../source/app/api/documents/generate/route';
import * as route7 from '../source/app/api/documents/route';
import * as route8 from '../source/app/api/meetings/route';
import * as route9 from '../source/app/api/notifications/route';
import * as route10 from '../source/app/api/tick/route';
export const routes:Record<string,Record<string,any>>={
  '/api/auth/login':route0,
  '/api/auth/logout':route1,
  '/api/auth/password':route2,
  '/api/data':route3,
  '/api/devices':route4,
  '/api/documents/download':route5,
  '/api/documents/generate':route6,
  '/api/documents':route7,
  '/api/meetings':route8,
  '/api/notifications':route9,
  '/api/tick':route10
};
