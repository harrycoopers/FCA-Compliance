import {login,withApiErrors} from '../../../../lib/portal-auth';
export const POST=withApiErrors(login);
