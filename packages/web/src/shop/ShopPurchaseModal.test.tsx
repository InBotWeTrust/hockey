import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ShopPurchaseModal } from './ShopPurchaseModal.js';
const props={title:'Купить заряд?',copy:'75 минут энергии',coinPrice:7490,starPrice:300,canBuyCoins:true,canBuyStars:true,isSaving:false,error:null,onClose:vi.fn(),onConfirm:vi.fn()};
it('renders currency icons and colored amounts without visible currency words',()=>{
 render(<ShopPurchaseModal {...props}/>);
 const coins=screen.getByRole('button',{name:/Купить за 7.*490 монет/});
 const stars=screen.getByRole('button',{name:'Купить за 300 звёзд'});
 expect(coins.textContent).not.toMatch(/монет/);expect(stars.textContent).not.toMatch(/звёзд/);
 expect(coins.querySelector('svg')).toBeInTheDocument();expect(stars.querySelector('svg')).toBeInTheDocument();
 fireEvent.click(coins);expect(props.onConfirm).toHaveBeenCalledWith('coins');
 fireEvent.click(stars);expect(props.onConfirm).toHaveBeenCalledWith('stars');
});
it('keeps an unaffordable purchase disabled while retaining its visible price',()=>{
 const confirm=vi.fn();render(<ShopPurchaseModal {...props} canBuyCoins={false} onConfirm={confirm}/>);
 const coins=screen.getByRole('button',{name:/Купить за 7.*490 монет/});
 expect(coins).toBeDisabled();expect(coins.textContent).toMatch(/7.*490/);
 fireEvent.click(coins);expect(confirm).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Купить за 300 звёзд'})).toBeEnabled();
});
it('blocks both purchase actions and close while saving',()=>{
 render(<ShopPurchaseModal {...props} isSaving/>);
 expect(screen.getAllByRole('button',{name:'Покупка...'})).toHaveLength(2);
 for(const button of screen.getAllByRole('button'))expect(button).toBeDisabled();
});
