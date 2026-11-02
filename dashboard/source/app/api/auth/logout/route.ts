import {logout,withApiErrors} from '../../../../lib/portal-auth';
export const POST=withApiErrors(logout);
