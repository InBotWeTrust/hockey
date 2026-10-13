update achievements set requirement='Набрать '||split_part(id,'-',2)||
 case when id='fans-1' then ' болельщика.' else ' болельщиков.' end
where id in ('fans-1','fans-10','fans-20','fans-50','fans-100','fans-500','fans-1000');
