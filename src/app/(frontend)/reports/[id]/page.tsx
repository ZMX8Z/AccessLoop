import {redirect} from 'next/navigation';
export default async function DetailAlias({params}:{params:Promise<{id:string}>}){const {id}=await params;redirect('/my-reports/'+encodeURIComponent(id))}
