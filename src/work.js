let active=0;
export const working=()=>active>0;
export async function track(task){active++;try{return await task()}finally{active--}}
