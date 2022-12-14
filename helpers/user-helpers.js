const async = require('hbs/lib/async')
var db=require('../config/connection')
const bcrypt=require('bcrypt')
const { ObjectId } = require('mongodb')
const { resolve } = require('promise')
var objectId=require('mongodb').ObjectId
const Razorpay = require('razorpay');

var instance = new Razorpay({
  key_id: 'rzp_test_fxCmESqaqHj93a',
  key_secret: 'eombhq6jXPvJuVNqbmbyDfkR',
});
//Loading the crypto module in node.js
var crypto = require('crypto');
//creating hmac object 
var hmac = crypto.createHmac('sha256', 'eombhq6jXPvJuVNqbmbyDfkR');

module.exports={
    addUser: (userData)=>{
        return new Promise(async(resolve,reject)=>{
            userData.password= await bcrypt.hash(userData.password,10)
            console.log(userData)
            db.get().collection('users').insertOne(userData).then((data)=>{
                
                resolve(data)
            })
        }) 
    },
    loginCheck: (userData)=>{
        return new Promise(async(resolve,reject)=>{
            let loginStatus= false
            let response= {}
            
            let user= await db.get().collection('users').findOne({email:userData.email})
            if(user){
                bcrypt.compare(userData.password,user.password).then((status)=>{
                    if(status){
                        response.user= user
                        response.status=true
                        console.log("credentials are correct")
                        resolve(response)
                    }else{
                        console.log("Credentials do not match")
                        resolve({status:false})
                    }
                })
            }else{
                console.log("user not found")
                resolve({status:false})
                
            }
        })
    },
    addToCart:(prodId,userId)=>{
        let prodObj={
            item:ObjectId(prodId),
            quantity:1
        }
        return new Promise(async(resolve,reject)=>{
            
            let userCart= await db.get().collection('cart').findOne({user:ObjectId(userId)})
            
            if(userCart){

                let proExist= userCart.products.findIndex(product=>product.item==prodId)
                if(proExist!= -1){
                    db.get().collection('cart').updateOne({'products.item':ObjectId(prodId), user:ObjectId(userId)},
                    {
                        $inc:{'products.$.quantity':1}
                    }
                    ).then(()=>{
                        resolve()
                    })
                }else{
                    db.get().collection('cart').updateOne({user:ObjectId(userId)},
                    {
                        $push:{products:prodObj}
                    }).then(()=>{
                        resolve()
                    })
                    
                }
    
            }else{
                
                
                let cartObj={
                    user:ObjectId(userId),
                    products:[prodObj]

                }
                db.get().collection('cart').insertOne(cartObj).then((response)=>{
                    resolve(response)
                })
            }
        })
       
    },
    getCartItems:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            let cartItems=[]
            cartItems= await db.get().collection('cart').aggregate([
                {
                    $match:{user:ObjectId(userId)}
                },
                {
                    $unwind: '$products'
                },
                {
                    $project:{
                        item:'$products.item',
                        quantity: '$products.quantity'
                    }
                },
                {
                    $lookup:{
                        from:'products',
                        localField:'item',
                        foreignField:'_id',
                        as:'product'
                    }
                }
            ]).toArray()
            
            /*if(cartItems.length===0){
                resolve(null)
            }else{*/
                
                resolve(cartItems)
                
           // }
            
           
        })
    },
    getCartCount:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            let count=0
            
            cart= await db.get().collection('cart').findOne({user:ObjectId(userId)})
            
            if(cart){
                count=cart.products.length
            }
            resolve(count)
            
        })
    },
    changeProductQuantity:(details)=>{
        //console.log(details)
        details.count=parseInt(details.count)
        return new Promise((resolve,reject)=>{
            db.get().collection('cart').updateOne({'_id':ObjectId(details.cart), 'products.item':ObjectId(details.product)},
                    {
                        $inc:{'products.$.quantity':details.count}
                        
                    }
                    ).then((response)=>{
                        
                        resolve(response)
                    })
        })

    },
    deleteProduct:(details)=>{
        return new Promise((resolve,reject)=>{
            db.get().collection('cart').updateOne({'_id':ObjectId(details.cart)},
                {
                    $pull:{products:{item:ObjectId(details.product)}}
                }
            ).then((response)=>{
                resolve(response)
            })
        })
    },
    getTotalAmount:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            
            total= await db.get().collection('cart').aggregate([
                {
                    $match:{user:ObjectId(userId)}
                },
                {
                    $unwind: '$products'
                },
                {
                    $project:{
                        item:'$products.item',
                        quantity: '$products.quantity'
                    }
                },
                {
                    $lookup:{
                        from:'products',
                        localField:'item',
                        foreignField:'_id',
                        as:'product'
                    }
                },
                {
                    $project:{
                        item:1,quantity:1,product:{$arrayElemAt:['$product',0]}
                    }
                },
                {
                    $group:{
                        _id:null,
                        total:{$sum:{$multiply:[{$toInt:'$quantity'},{$toInt:'$product.price'}]}}
                    }
                }
            ]).toArray()

            
            resolve(total[0].total)

        })
    },
    getProductDetails:(userId)=>{
        return new Promise(async(resolve,reject)=>{
            let cart=await db.get().collection('cart').findOne({'user':ObjectId(userId)})
            
            resolve(cart.products)
        })
    },
    placeOrder:(data,products,totalPrice)=>{
        return new Promise(async(resolve,reject)=>{
            let status=data.payment==='cod'?'placed':'pending'
            orderObj={
                user:data.user,
                status:status,
                address:data.address,
                paymentMethod:data.payment,
                totalPrice:totalPrice,
                products:products,
                date:new Date()
            }
            await db.get().collection('order').insertOne(orderObj).then(async(response)=>{
                await db.get().collection('cart').deleteOne({'user':ObjectId(data.user)})
                //console.log(response.insertedId)
                resolve(response.insertedId)
            })
        })
    },
    generateRazorpay:(orderId,totalPrice)=>{
        return new Promise((resolve,reject)=>{
            var options = {
                amount: totalPrice * 100,  // amount in the smallest currency unit
                currency: "INR",
                receipt: ""+orderId
              };
              instance.orders.create(options, function(err, order) {
                if(err){
                    console.log(err)
                }else{
                    
                    resolve(order);
                }
                
              });
        })
    },
    
    verifyPayment:(data)=>{
        return new Promise((resolve,reject)=>{
        //console.log("reached userhelpers" ,data)
        hmac.update(data['orderDetails[id]'] + "|" + data['paymentResult[razorpay_payment_id]'])
        hmacNew=hmac.digest('hex')
        if(hmacNew==(data['paymentResult[razorpay_signature]'])){
            resolve()
        }else{
            reject()

        }
    })
    },
    updateOrderStatus:(data)=>{
        return new Promise(async(resolve,reject)=>{
            await db.get().collection('order').updateOne({'_id':ObjectId(data['orderDetails[receipt]'])},
            {
                $set:{'status':'placed'}
            }
            )
            resolve()
        })
        
    }
}